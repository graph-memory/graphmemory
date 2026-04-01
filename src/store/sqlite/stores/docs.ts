import Database from 'better-sqlite3';
import type {
  DocsStore,
  DocNode,
  DocFileEntry,
  SearchQuery,
  SearchResult,
  PaginationOptions,
} from '../../types';
import { MetaHelper } from '../lib/meta';
import { num } from '../lib/bigint';
import { hybridSearch, SearchConfig } from '../lib/search';

const GRAPH = 'docs';

const SEARCH_CONFIG: SearchConfig = {
  ftsTable: 'docs_fts', vecTable: 'docs_vec', parentTable: 'docs', parentIdColumn: 'id',
};

export class SqliteDocsStore implements DocsStore {
  private meta: MetaHelper;

  constructor(private db: Database.Database, private projectId: number) {
    this.meta = new MetaHelper(db, GRAPH);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private toNode(row: Record<string, unknown>): DocNode {
    return {
      id: num(row.id as bigint),
      kind: row.kind as DocNode['kind'],
      fileId: row.file_id as string,
      title: row.title as string,
      content: row.content as string,
      level: num(row.level as bigint),
      language: (row.language as string | null) ?? undefined,
      symbols: JSON.parse(row.symbols_json as string),
      mtime: num(row.mtime as bigint),
    };
  }

  private toFileEntry(row: Record<string, unknown>): DocFileEntry {
    return {
      id: num(row.id as bigint),
      fileId: row.file_id as string,
      title: row.title as string,
      chunkCount: num(row.chunk_count as bigint),
      mtime: num(row.mtime as bigint),
    };
  }

  // =========================================================================
  // updateFile
  // =========================================================================

  updateFile(
    fileId: string,
    chunks: Omit<DocNode, 'id' | 'kind'>[],
    mtime: number,
    embeddings: Map<string, number[]>,
  ): void {
    const run = this.db.transaction(() => {
      // 1. Delete old nodes for this file (cleanup triggers handle edges + vec0)
      this.db.prepare('DELETE FROM docs WHERE project_id = ? AND file_id = ?')
        .run(this.projectId, fileId);

      // 2. Insert file node
      const fileTitle = chunks.length > 0 ? chunks[0].title : fileId;
      const fileResult = this.db.prepare(`
        INSERT INTO docs (project_id, kind, file_id, title, content, level, symbols_json, mtime)
        VALUES (?, 'file', ?, ?, '', 0, '[]', ?)
      `).run(this.projectId, fileId, fileTitle, mtime);
      const fileNodeId = num(fileResult.lastInsertRowid as bigint);

      // Insert file embedding if available
      const fileEmb = embeddings.get(fileId);
      if (fileEmb) {
        this.db.prepare('INSERT INTO docs_vec (rowid, embedding) VALUES (?, ?)')
          .run(BigInt(fileNodeId), Buffer.from(new Float32Array(fileEmb).buffer));
      }

      // 3. Insert chunk nodes
      const insertChunk = this.db.prepare(`
        INSERT INTO docs (project_id, kind, file_id, title, content, level, language, symbols_json, mtime)
        VALUES (?, 'chunk', ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertVec = this.db.prepare('INSERT INTO docs_vec (rowid, embedding) VALUES (?, ?)');
      const insertEdge = this.db.prepare(`
        INSERT OR IGNORE INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind)
        VALUES (?, 'docs', ?, 'docs', ?, ?)
      `);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const result = insertChunk.run(
          this.projectId, fileId,
          chunk.title, chunk.content, chunk.level,
          chunk.language ?? null,
          JSON.stringify(chunk.symbols),
          chunk.mtime,
        );
        const chunkId = num(result.lastInsertRowid as bigint);

        // Insert embedding (key by chunk ref: `fileId#index`)
        const embKey = `${fileId}#${i}`;
        const emb = embeddings.get(embKey);
        if (emb) {
          insertVec.run(BigInt(chunkId), Buffer.from(new Float32Array(emb).buffer));
        }

        // Edge: file → chunk (contains)
        insertEdge.run(this.projectId, fileNodeId, chunkId, 'contains');
      }
    });

    run();
  }

  // =========================================================================
  // removeFile
  // =========================================================================

  removeFile(fileId: string): void {
    this.db.prepare('DELETE FROM docs WHERE project_id = ? AND file_id = ?')
      .run(this.projectId, fileId);
  }

  // =========================================================================
  // resolveLinks
  // =========================================================================

  resolveLinks(edges: Array<{ fromFileId: string; toFileId: string }>): void {
    const findFile = this.db.prepare(
      "SELECT id FROM docs WHERE project_id = ? AND file_id = ? AND kind = 'file' LIMIT 1"
    );
    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind)
      VALUES (?, 'docs', ?, 'docs', ?, 'references')
    `);

    const run = this.db.transaction(() => {
      for (const edge of edges) {
        const fromRow = findFile.get(this.projectId, edge.fromFileId) as { id: bigint } | undefined;
        const toRow = findFile.get(this.projectId, edge.toFileId) as { id: bigint } | undefined;
        if (fromRow && toRow) {
          insertEdge.run(this.projectId, num(fromRow.id), num(toRow.id));
        }
      }
    });

    run();
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getFileMtime(fileId: string): number | null {
    const row = this.db.prepare("SELECT mtime FROM docs WHERE project_id = ? AND file_id = ? AND kind = 'file'")
      .get(this.projectId, fileId) as { mtime: bigint } | undefined;
    return row ? num(row.mtime) : null;
  }

  listFiles(filter?: string, pagination?: PaginationOptions): { results: DocFileEntry[]; total: number } {
    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const conditions: string[] = ['d.project_id = ?', "d.kind = 'file'"];
    const params: unknown[] = [this.projectId];

    if (filter) {
      conditions.push('(d.file_id LIKE ? OR d.title LIKE ?)');
      const like = `%${filter}%`;
      params.push(like, like);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`
      SELECT d.id, d.file_id, d.title, d.mtime,
        (SELECT COUNT(*) FROM docs c WHERE c.project_id = d.project_id AND c.file_id = d.file_id AND c.kind = 'chunk') AS chunk_count
      FROM docs d WHERE ${where}
      ORDER BY d.file_id ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<Record<string, unknown>>;

    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM docs d WHERE ${where}`).get(...params) as { c: bigint }).c);

    return { results: rows.map(r => this.toFileEntry(r)), total };
  }

  getFileChunks(fileId: string): DocNode[] {
    const rows = this.db.prepare(
      "SELECT * FROM docs WHERE project_id = ? AND file_id = ? AND kind = 'chunk' ORDER BY level ASC, id ASC"
    ).all(this.projectId, fileId) as Array<Record<string, unknown>>;
    return rows.map(r => this.toNode(r));
  }

  getNode(nodeId: number): DocNode | null {
    const row = this.db.prepare('SELECT * FROM docs WHERE id = ? AND project_id = ?')
      .get(nodeId, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toNode(row) : null;
  }

  search(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
  }

  searchFiles(query: SearchQuery): SearchResult[] {
    const allResults = hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
    if (allResults.length === 0) return [];

    const ids = allResults.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const fileIds = this.db.prepare(
      `SELECT id FROM docs WHERE id IN (${placeholders}) AND project_id = ? AND kind = 'file'`
    ).all(...ids, this.projectId) as Array<{ id: bigint }>;

    const fileIdSet = new Set(fileIds.map(r => num(r.id)));
    return allResults.filter(r => fileIdSet.has(r.id));
  }

  listSnippets(language?: string, pagination?: PaginationOptions): { results: DocNode[]; total: number } {
    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const conditions: string[] = ['project_id = ?', "kind = 'chunk'", 'language IS NOT NULL'];
    const params: unknown[] = [this.projectId];

    if (language) {
      conditions.push('language = ?');
      params.push(language);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT * FROM docs WHERE ${where} ORDER BY id ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM docs WHERE ${where}`).get(...params) as { c: bigint }).c);

    return { results: rows.map(r => this.toNode(r)), total };
  }

  searchSnippets(query: SearchQuery, language?: string): SearchResult[] {
    const allResults = hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
    if (allResults.length === 0) return [];

    const ids = allResults.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');

    let sql = `SELECT id FROM docs WHERE id IN (${placeholders}) AND project_id = ? AND kind = 'chunk' AND language IS NOT NULL`;
    const params: unknown[] = [...ids, this.projectId];
    if (language) {
      sql += ' AND language = ?';
      params.push(language);
    }

    const snippetIds = this.db.prepare(sql).all(...params) as Array<{ id: bigint }>;
    const snippetIdSet = new Set(snippetIds.map(r => num(r.id)));
    return allResults.filter(r => snippetIdSet.has(r.id));
  }

  findBySymbol(symbol: string): DocNode[] {
    const rows = this.db.prepare(`
      SELECT d.* FROM docs d, json_each(d.symbols_json) je
      WHERE d.project_id = ? AND je.value = ?
    `).all(this.projectId, symbol) as Array<Record<string, unknown>>;
    return rows.map(r => this.toNode(r));
  }

  // =========================================================================
  // Meta
  // =========================================================================

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
