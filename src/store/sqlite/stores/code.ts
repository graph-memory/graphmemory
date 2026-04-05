import Database from 'better-sqlite3';
import type {
  CodeStore,
  CodeNode,
  CodeFileEntry,
  SearchQuery,
  SearchResult,
  PaginationOptions,
} from '../../types';
import { MetaHelper } from '../lib/meta';
import { num, likeEscape, assertEmbeddingDim } from '../lib/bigint';
import { hybridSearch, SearchConfig } from '../lib/search';
import * as path from 'path';

const GRAPH = 'code';

const SEARCH_CONFIG: SearchConfig = {
  ftsTable: 'code_fts', vecTable: 'code_vec', parentTable: 'code', parentIdColumn: 'id',
};

export class SqliteCodeStore implements CodeStore {
  private meta: MetaHelper;

  constructor(private db: Database.Database, private projectId: number, private embeddingDim: number = 384) {
    this.meta = new MetaHelper(db, `${projectId}:${GRAPH}`);
  }

  clear(): void {
    this.db.prepare('DELETE FROM code WHERE project_id = ?').run(this.projectId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private toNode(row: Record<string, unknown>): CodeNode {
    return {
      id: num(row.id as bigint),
      kind: row.kind as string,
      fileId: row.file_id as string,
      language: row.language as string,
      name: row.name as string,
      signature: row.signature as string,
      docComment: row.doc_comment as string,
      body: row.body as string,
      startLine: num(row.start_line as bigint),
      endLine: num(row.end_line as bigint),
      isExported: row.is_exported === BigInt(1),
      mtime: num(row.mtime as bigint),
    };
  }

  private toFileEntry(row: Record<string, unknown>): CodeFileEntry {
    return {
      id: num(row.id as bigint),
      fileId: row.file_id as string,
      language: row.language as string,
      symbolCount: num(row.symbol_count as bigint),
      mtime: num(row.mtime as bigint),
    };
  }

  // =========================================================================
  // updateFile
  // =========================================================================

  updateFile(
    fileId: string,
    nodes: Omit<CodeNode, 'id'>[],
    edges: Array<{ fromName: string; toName: string; kind: string }>,
    mtime: number,
    embeddings: Map<string, number[]>,
  ): void {
    // 1. Delete old nodes for this file (cleanup triggers handle edges + vec0)
    this.db.prepare('DELETE FROM code WHERE project_id = ? AND file_id = ?')
      .run(this.projectId, fileId);

    // 2. Insert file node
    const fileName = path.basename(fileId);
    const language = nodes.length > 0 ? nodes[0].language : '';
    const fileResult = this.db.prepare(`
      INSERT INTO code (project_id, kind, file_id, language, name, mtime)
      VALUES (?, 'file', ?, ?, ?, ?)
    `).run(this.projectId, fileId, language, fileName, mtime);
    const fileNodeId = num(fileResult.lastInsertRowid as bigint);

    // Insert file embedding if available
    const fileEmb = embeddings.get(fileId);
    if (fileEmb) {
      assertEmbeddingDim(fileEmb, this.embeddingDim);
      this.db.prepare('INSERT INTO code_vec (rowid, embedding) VALUES (?, ?)')
        .run(BigInt(fileNodeId), Buffer.from(new Float32Array(fileEmb).buffer));
    }

    // 3. Insert symbol nodes
    const insertNode = this.db.prepare(`
      INSERT INTO code (project_id, kind, file_id, language, name, signature, doc_comment, body, start_line, end_line, is_exported, mtime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVec = this.db.prepare('INSERT INTO code_vec (rowid, embedding) VALUES (?, ?)');
    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO edges (from_project_id, from_graph, from_id, to_project_id, to_graph, to_id, kind)
      VALUES (?, 'code', ?, ?, 'code', ?, ?)
    `);

    const nameToId = new Map<string, number>();
    nameToId.set(fileName, fileNodeId);

    for (const node of nodes) {
      const result = insertNode.run(
        this.projectId, node.kind, fileId, node.language,
        node.name, node.signature, node.docComment, node.body,
        node.startLine, node.endLine, node.isExported ? 1 : 0, node.mtime,
      );
      const nodeId = num(result.lastInsertRowid as bigint);
      nameToId.set(node.name, nodeId);

      // Insert embedding
      const emb = embeddings.get(node.name);
      if (emb) {
        assertEmbeddingDim(emb, this.embeddingDim);
        insertVec.run(BigInt(nodeId), Buffer.from(new Float32Array(emb).buffer));
      }

      // Edge: file → symbol (contains)
      insertEdge.run(this.projectId, fileNodeId, this.projectId, nodeId, 'contains');
    }

    // 4. Insert intra-file edges
    for (const edge of edges) {
      const fromId = nameToId.get(edge.fromName);
      const toId = nameToId.get(edge.toName);
      if (fromId !== undefined && toId !== undefined) {
        insertEdge.run(this.projectId, fromId, this.projectId, toId, edge.kind);
      }
    }
  }

  // =========================================================================
  // removeFile
  // =========================================================================

  removeFile(fileId: string): void {
    // Cleanup triggers handle edges, attachments, vec0
    this.db.prepare('DELETE FROM code WHERE project_id = ? AND file_id = ?')
      .run(this.projectId, fileId);
  }

  // =========================================================================
  // resolveEdges
  // =========================================================================

  resolveEdges(edges: Array<{ fromName: string; toName: string; kind: string }>): void {
    const findByName = this.db.prepare("SELECT id FROM code WHERE project_id = ? AND name = ? AND kind != 'file'");
    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO edges (from_project_id, from_graph, from_id, to_project_id, to_graph, to_id, kind)
      VALUES (?, 'code', ?, ?, 'code', ?, ?)
    `);

    for (const edge of edges) {
      const fromRows = findByName.all(this.projectId, edge.fromName) as Array<{ id: bigint }>;
      const toRows = findByName.all(this.projectId, edge.toName) as Array<{ id: bigint }>;
      for (const fromRow of fromRows) {
        for (const toRow of toRows) {
          insertEdge.run(this.projectId, num(fromRow.id), this.projectId, num(toRow.id), edge.kind);
        }
      }
    }
  }

  // =========================================================================
  // resolveImports
  // =========================================================================

  resolveImports(imports: Array<{ fromFileId: string; toFileId: string }>): void {
    const findFile = this.db.prepare(
      "SELECT id FROM code WHERE project_id = ? AND file_id = ? AND kind = 'file' LIMIT 1"
    );
    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO edges (from_project_id, from_graph, from_id, to_project_id, to_graph, to_id, kind)
      VALUES (?, 'code', ?, ?, 'code', ?, 'imports')
    `);

    for (const imp of imports) {
      const fromRow = findFile.get(this.projectId, imp.fromFileId) as { id: bigint } | undefined;
      const toRow = findFile.get(this.projectId, imp.toFileId) as { id: bigint } | undefined;
      if (fromRow && toRow) {
        insertEdge.run(this.projectId, num(fromRow.id), this.projectId, num(toRow.id));
      }
    }
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getFileMtime(fileId: string): number | null {
    const row = this.db.prepare('SELECT mtime FROM code WHERE project_id = ? AND file_id = ? AND kind = \'file\'')
      .get(this.projectId, fileId) as { mtime: bigint } | undefined;
    return row ? num(row.mtime) : null;
  }

  listFiles(filter?: string, pagination?: PaginationOptions): { results: CodeFileEntry[]; total: number } {
    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const conditions: string[] = ['f.project_id = ?', "f.kind = 'file'"];
    const params: unknown[] = [this.projectId];

    if (filter) {
      conditions.push("f.file_id LIKE ? ESCAPE '\\'");
      params.push(`%${likeEscape(filter)}%`);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`
      SELECT f.id, f.file_id, f.language, f.mtime,
        COALESCE(s.cnt, 0) AS symbol_count
      FROM code f
      LEFT JOIN (
        SELECT file_id, COUNT(*) AS cnt FROM code WHERE project_id = ? AND kind != 'file' GROUP BY file_id
      ) s ON s.file_id = f.file_id
      WHERE ${where}
      ORDER BY f.file_id ASC LIMIT ? OFFSET ?
    `).all(this.projectId, ...params, limit, offset) as Array<Record<string, unknown>>;

    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM code f WHERE ${where}`).get(...params) as { c: bigint }).c);

    return { results: rows.map(r => this.toFileEntry(r)), total };
  }

  getFileSymbols(fileId: string): CodeNode[] {
    const rows = this.db.prepare(
      "SELECT * FROM code WHERE project_id = ? AND file_id = ? AND kind != 'file' ORDER BY start_line ASC"
    ).all(this.projectId, fileId) as Array<Record<string, unknown>>;
    return rows.map(r => this.toNode(r));
  }

  getNode(nodeId: number): CodeNode | null {
    const row = this.db.prepare('SELECT * FROM code WHERE id = ? AND project_id = ?')
      .get(nodeId, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toNode(row) : null;
  }

  search(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
  }

  searchFiles(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, { ...SEARCH_CONFIG, extraJoinCondition: "AND p.kind = 'file'" }, query, this.projectId);
  }

  findByName(name: string): CodeNode[] {
    const rows = this.db.prepare(
      "SELECT * FROM code WHERE project_id = ? AND name = ? AND kind != 'file'"
    ).all(this.projectId, name) as Array<Record<string, unknown>>;
    return rows.map(r => this.toNode(r));
  }

  // =========================================================================
  // Meta
  // =========================================================================

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
