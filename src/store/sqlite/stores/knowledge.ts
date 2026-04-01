import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  KnowledgeStore,
  NoteCreate,
  NotePatch,
  NoteRecord,
  NoteDetail,
  PaginationOptions,
  SearchQuery,
  SearchResult,
} from '../../types';
import { VersionConflictError } from '../../types';
import { MetaHelper } from '../lib/meta';
import { EntityHelpers } from '../lib/entity-helpers';
import { num, now } from '../lib/bigint';
import { hybridSearch, SearchConfig } from '../lib/search';

const GRAPH = 'knowledge';

const SEARCH_CONFIG: SearchConfig = {
  ftsTable: 'knowledge_fts',
  vecTable: 'knowledge_vec',
  parentTable: 'knowledge',
  parentIdColumn: 'id',
};

export class SqliteKnowledgeStore implements KnowledgeStore {
  private meta: MetaHelper;
  private helpers: EntityHelpers;
  private stmts: ReturnType<SqliteKnowledgeStore['prepareStatements']>;

  constructor(private db: Database.Database, private projectId: number) {
    this.meta = new MetaHelper(db, GRAPH);
    this.helpers = new EntityHelpers(db, projectId);
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO knowledge (project_id, slug, title, content, version, created_by_id, updated_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
      `),
      insertVec: this.db.prepare('INSERT INTO knowledge_vec (rowid, embedding) VALUES (?, ?)'),
      deleteVec: this.db.prepare('DELETE FROM knowledge_vec WHERE rowid = ?'),
      delete: this.db.prepare('DELETE FROM knowledge WHERE id = ? AND project_id = ?'),
      getById: this.db.prepare('SELECT * FROM knowledge WHERE id = ? AND project_id = ?'),
      getBySlug: this.db.prepare('SELECT * FROM knowledge WHERE slug = ? AND project_id = ?'),
      getUpdatedAt: this.db.prepare('SELECT updated_at FROM knowledge WHERE id = ? AND project_id = ?'),
    };
  }

  private toRecord(row: Record<string, unknown>, tags?: string[]): NoteRecord {
    const id = num(row.id as bigint);
    return {
      id,
      slug: row.slug as string,
      title: row.title as string,
      content: row.content as string,
      tags: tags ?? this.helpers.fetchTags(GRAPH, id),
      attachments: this.helpers.fetchAttachments(GRAPH, id),
      createdAt: num(row.created_at as bigint),
      updatedAt: num(row.updated_at as bigint),
      version: num(row.version as bigint),
      createdById: row.created_by_id ? num(row.created_by_id as bigint) : null,
      updatedById: row.updated_by_id ? num(row.updated_by_id as bigint) : null,
    };
  }

  private toDetail(row: Record<string, unknown>): NoteDetail {
    const record = this.toRecord(row);
    return { ...record, edges: this.helpers.fetchEdges(GRAPH, record.id) };
  }

  create(data: NoteCreate, embedding: number[]): NoteRecord {
    const slug = randomUUID();
    const ts = now();
    const authorId = data.authorId ?? null;

    const result = this.stmts.insert.run(this.projectId, slug, data.title, data.content, authorId, authorId, ts, ts);
    const id = result.lastInsertRowid;

    this.stmts.insertVec.run(id, Buffer.from(new Float32Array(embedding).buffer));

    if (data.tags && data.tags.length > 0) {
      this.helpers.setTags(GRAPH, num(id), data.tags);
    }

    return this.toRecord(this.stmts.getById.get(num(id), this.projectId) as Record<string, unknown>);
  }

  update(noteId: number, patch: NotePatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): NoteRecord {
    const row = this.stmts.getById.get(noteId, this.projectId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Note ${noteId} not found`);

    if (expectedVersion !== undefined) {
      const current = num(row.version as bigint);
      if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
    }

    const title = patch.title ?? row.title as string;
    const content = patch.content ?? row.content as string;

    this.db.prepare(`
      UPDATE knowledge SET title = ?, content = ?, version = version + 1, updated_by_id = ?, updated_at = ?
      WHERE id = ? AND project_id = ?
    `).run(title, content, authorId ?? null, now(), noteId, this.projectId);

    if (embedding) {
      this.stmts.deleteVec.run(BigInt(noteId));
      this.stmts.insertVec.run(BigInt(noteId), Buffer.from(new Float32Array(embedding).buffer));
    }

    if (patch.tags !== undefined) {
      this.helpers.setTags(GRAPH, noteId, patch.tags);
    }

    return this.toRecord(this.stmts.getById.get(noteId, this.projectId) as Record<string, unknown>);
  }

  delete(noteId: number): void {
    this.stmts.delete.run(noteId, this.projectId);
  }

  get(noteId: number): NoteDetail | null {
    const row = this.stmts.getById.get(noteId, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toDetail(row) : null;
  }

  getBySlug(slug: string): NoteDetail | null {
    const row = this.stmts.getBySlug.get(slug, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toDetail(row) : null;
  }

  list(filter?: string, tag?: string, pagination?: PaginationOptions): { results: NoteRecord[]; total: number } {
    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const conditions: string[] = ['k.project_id = ?'];
    const params: unknown[] = [this.projectId];

    if (filter) {
      conditions.push('(k.title LIKE ? OR k.content LIKE ?)');
      const like = `%${filter}%`;
      params.push(like, like);
    }

    if (tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM edges e JOIN tags t ON t.id = e.from_id AND t.project_id = e.project_id
        WHERE e.project_id = k.project_id AND e.to_graph = 'knowledge' AND e.to_id = k.id
        AND e.from_graph = 'tags' AND e.kind = 'tagged' AND t.name = ?
      )`);
      params.push(tag);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT k.* FROM knowledge k WHERE ${where} ORDER BY k.updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM knowledge k WHERE ${where}`).get(...params) as { c: bigint }).c);

    // Batch fetch tags + attachments to avoid N+1
    const ids = rows.map(r => num(r.id as bigint));
    const tagsMap = this.helpers.fetchTagsBatch(GRAPH, ids);
    const attachMap = this.helpers.fetchAttachmentsBatch(GRAPH, ids);

    const results = rows.map(r => {
      const id = num(r.id as bigint);
      const record = this.toRecord(r, tagsMap.get(id));
      record.attachments = attachMap.get(id) ?? [];
      return record;
    });

    return { results, total };
  }

  search(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
  }

  getUpdatedAt(noteId: number): number | null {
    const row = this.stmts.getUpdatedAt.get(noteId, this.projectId) as { updated_at: bigint } | undefined;
    return row ? num(row.updated_at) : null;
  }

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
