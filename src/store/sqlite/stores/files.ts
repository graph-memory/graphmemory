import Database from 'better-sqlite3';
import * as path from 'path';
import type {
  FilesStore,
  FileNode,
  FileListOptions,
  FileUpdateOptions,
  SearchQuery,
  SearchResult,
} from '../../types';
import { MetaHelper } from '../lib/meta';
import { num, likeEscape, assertEmbeddingDim } from '../lib/bigint';

const GRAPH = 'files';

export class SqliteFilesStore implements FilesStore {
  private meta: MetaHelper;

  constructor(private db: Database.Database, private projectId: number, private embeddingDim: number = 384) {
    this.meta = new MetaHelper(db, `${projectId}:${GRAPH}`);
  }

  clear(): void {
    this.db.prepare('DELETE FROM files WHERE project_id = ?').run(this.projectId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private toNode(row: Record<string, unknown>): FileNode {
    return {
      id: num(row.id as bigint),
      kind: row.kind as FileNode['kind'],
      filePath: row.file_path as string,
      fileName: row.file_name as string,
      directory: row.directory as string,
      extension: row.extension as string,
      language: (row.language as string | null),
      mimeType: (row.mime_type as string | null),
      size: num(row.size as bigint),
      mtime: num(row.mtime as bigint),
    };
  }

  private ensureDirectory(dirPath: string): number {
    if (!dirPath || dirPath === '.' || dirPath === '') return -1;

    // Check if directory already exists
    const existing = this.db.prepare(
      "SELECT id FROM files WHERE project_id = ? AND file_path = ? AND kind = 'directory'"
    ).get(this.projectId, dirPath) as { id: bigint } | undefined;

    if (existing) return num(existing.id);

    // Recursively ensure parent exists first
    const parentDir = path.dirname(dirPath);
    if (parentDir !== dirPath && parentDir !== '.' && parentDir !== '') {
      this.ensureDirectory(parentDir);
    }

    const dirName = path.basename(dirPath) || dirPath;

    const result = this.db.prepare(`
      INSERT INTO files (project_id, kind, file_path, file_name, directory, extension, size, mtime)
      VALUES (?, 'directory', ?, ?, ?, '', 0, 0)
    `).run(this.projectId, dirPath, dirName, parentDir === dirPath ? '' : parentDir);

    return num(result.lastInsertRowid as bigint);
  }

  // =========================================================================
  // updateFile
  // =========================================================================

  updateFile(filePath: string, size: number, mtime: number, embedding: number[], opts?: FileUpdateOptions): void {
    assertEmbeddingDim(embedding, this.embeddingDim);
    const fileName = path.basename(filePath);
    const directory = path.dirname(filePath);
    const extension = path.extname(filePath);
    const language = opts?.language ?? null;
    const mimeType = opts?.mimeType ?? null;

    // Ensure parent directory exists
    if (directory && directory !== '.') {
      this.ensureDirectory(directory);
    }

    // Check if file already exists
    const existing = this.db.prepare(
      "SELECT id FROM files WHERE project_id = ? AND file_path = ? AND kind = 'file'"
    ).get(this.projectId, filePath) as { id: bigint } | undefined;

    let fileId: number;

    if (existing) {
      fileId = num(existing.id);
      // Update existing
      this.db.prepare(`
        UPDATE files SET file_name = ?, directory = ?, extension = ?, language = ?, mime_type = ?, size = ?, mtime = ?
        WHERE id = ? AND project_id = ?
      `).run(fileName, directory, extension, language, mimeType, size, mtime, fileId, this.projectId);

      // Update vec0 (DELETE + INSERT pattern)
      this.db.prepare('DELETE FROM files_vec WHERE rowid = ?').run(BigInt(fileId));
      this.db.prepare('INSERT INTO files_vec (rowid, embedding) VALUES (?, ?)')
        .run(BigInt(fileId), Buffer.from(new Float32Array(embedding).buffer));
    } else {
      // Insert new file
      const result = this.db.prepare(`
        INSERT INTO files (project_id, kind, file_path, file_name, directory, extension, language, mime_type, size, mtime)
        VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(this.projectId, filePath, fileName, directory, extension, language, mimeType, size, mtime);
      fileId = num(result.lastInsertRowid as bigint);

      // Insert vec0
      this.db.prepare('INSERT INTO files_vec (rowid, embedding) VALUES (?, ?)')
        .run(BigInt(fileId), Buffer.from(new Float32Array(embedding).buffer));
    }
  }

  // =========================================================================
  // removeFile
  // =========================================================================

  removeFile(filePath: string): void {
    const row = this.db.prepare(
      "SELECT id, directory FROM files WHERE project_id = ? AND file_path = ? AND kind = 'file'"
    ).get(this.projectId, filePath) as { id: bigint; directory: string } | undefined;

    if (!row) return;

    // Delete the file (cleanup trigger handles edges, attachments, vec0)
    this.db.prepare('DELETE FROM files WHERE id = ? AND project_id = ?')
      .run(num(row.id), this.projectId);

    // Clean up empty parent directories
    this.cleanEmptyDirs(row.directory as string);
  }

  private cleanEmptyDirs(dirPath: string): void {
    if (!dirPath || dirPath === '.' || dirPath === '') return;

    // Check if this directory has any remaining children
    const childCount = num((this.db.prepare(
      'SELECT COUNT(*) AS c FROM files WHERE project_id = ? AND directory = ?'
    ).get(this.projectId, dirPath) as { c: bigint }).c);

    if (childCount === 0) {
      const dir = this.db.prepare(
        "SELECT id, directory FROM files WHERE project_id = ? AND file_path = ? AND kind = 'directory'"
      ).get(this.projectId, dirPath) as { id: bigint; directory: string } | undefined;

      if (dir) {
        this.db.prepare('DELETE FROM files WHERE id = ? AND project_id = ?')
          .run(num(dir.id), this.projectId);
        // Recurse up
        this.cleanEmptyDirs(dir.directory as string);
      }
    }
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getFileMtime(filePath: string): number | null {
    const row = this.db.prepare("SELECT mtime FROM files WHERE project_id = ? AND file_path = ? AND kind = 'file'")
      .get(this.projectId, filePath) as { mtime: bigint } | undefined;
    return row ? num(row.mtime) : null;
  }

  listFiles(opts?: FileListOptions): { results: FileNode[]; total: number } {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const conditions: string[] = ['project_id = ?'];
    const params: unknown[] = [this.projectId];

    if (opts?.directory) {
      conditions.push('directory = ?');
      params.push(opts.directory);
    }

    if (opts?.extension) {
      conditions.push('extension = ?');
      params.push(opts.extension);
    }

    if (opts?.filter) {
      conditions.push("file_path LIKE ? ESCAPE '\\'");
      params.push(`%${likeEscape(opts.filter)}%`);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT * FROM files WHERE ${where} ORDER BY kind ASC, file_path ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM files WHERE ${where}`).get(...params) as { c: bigint }).c);

    return { results: rows.map(r => this.toNode(r)), total };
  }

  getFileInfo(filePath: string): FileNode | null {
    const row = this.db.prepare('SELECT * FROM files WHERE project_id = ? AND file_path = ?')
      .get(this.projectId, filePath) as Record<string, unknown> | undefined;
    return row ? this.toNode(row) : null;
  }

  search(query: SearchQuery): SearchResult[] {
    // Files table has no FTS, so we handle keyword search via LIKE on file_path
    const mode = query.searchMode ?? 'hybrid';
    const maxResults = query.maxResults ?? 20;

    const minScore = query.minScore ?? 0;

    if (mode === 'keyword' && query.text) {
      // Fallback: LIKE-based search on file_path
      const rows = this.db.prepare(`
        SELECT id FROM files WHERE project_id = ? AND file_path LIKE ? ESCAPE '\\' AND kind = 'file'
        ORDER BY file_path ASC LIMIT ?
      `).all(this.projectId, `%${likeEscape(query.text)}%`, maxResults) as Array<{ id: bigint }>;

      return rows
        .map((r, i) => ({ id: num(r.id), score: 1 / (60 + i + 1) }))
        .filter(r => r.score >= minScore);
    }

    if (mode === 'vector' && query.embedding) {
      // Vector-only search
      const embeddingBuf = Buffer.from(new Float32Array(query.embedding).buffer);
      const topK = query.topK ?? 50;

      const rows = this.db.prepare(`
        SELECT v.rowid AS id, v.distance
        FROM files_vec v
        JOIN files p ON p.id = v.rowid AND p.project_id = ? AND p.kind = 'file'
        WHERE v.embedding MATCH ? AND v.k = ?
      `).all(this.projectId, embeddingBuf, topK * 3) as Array<{ id: bigint; distance: number }>;

      return rows.slice(0, maxResults)
        .map((r, i) => ({ id: num(r.id), score: 1 / (60 + i + 1) }))
        .filter(r => r.score >= minScore);
    }

    // Hybrid: combine LIKE + vector
    if (mode === 'hybrid') {
      const likeResults: Array<{ id: number; rn: number }> = [];
      const vecResults: Array<{ id: number; rn: number }> = [];

      if (query.text) {
        const rows = this.db.prepare(`
          SELECT id FROM files WHERE project_id = ? AND file_path LIKE ? ESCAPE '\\' AND kind = 'file'
          ORDER BY file_path ASC LIMIT ?
        `).all(this.projectId, `%${likeEscape(query.text)}%`, query.topK ?? 50) as Array<{ id: bigint }>;
        rows.forEach((r, i) => likeResults.push({ id: num(r.id), rn: i + 1 }));
      }

      if (query.embedding) {
        const embeddingBuf = Buffer.from(new Float32Array(query.embedding).buffer);
        const topK = query.topK ?? 50;
        const rows = this.db.prepare(`
          SELECT v.rowid AS id, v.distance
          FROM files_vec v
          JOIN files p ON p.id = v.rowid AND p.project_id = ? AND p.kind = 'file'
          WHERE v.embedding MATCH ? AND v.k = ?
        `).all(this.projectId, embeddingBuf, topK * 3) as Array<{ id: bigint; distance: number }>;
        rows.slice(0, topK).forEach((r, i) => vecResults.push({ id: num(r.id), rn: i + 1 }));
      }

      // RRF fusion
      const K = 60;
      const scores = new Map<number, number>();
      for (const r of likeResults) scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + r.rn));
      for (const r of vecResults) scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (K + r.rn));

      return [...scores.entries()]
        .map(([id, score]) => ({ id, score }))
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
    }

    return [];
  }

  // =========================================================================
  // Meta
  // =========================================================================

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
