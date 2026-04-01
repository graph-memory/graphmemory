import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  EpicsStore,
  EpicCreate,
  EpicPatch,
  EpicRecord,
  EpicDetail,
  EpicListOptions,
  EpicStatus,
  TaskPriority,
  AttachmentMeta,
  SearchQuery,
  SearchResult,
} from '../../types';
import { VersionConflictError } from '../../types';
import { MetaHelper } from '../lib/meta';
import { EntityHelpers } from '../lib/entity-helpers';
import { num, now } from '../lib/bigint';
import { hybridSearch, SearchConfig } from '../lib/search';

const GRAPH = 'epics';
const ORDER_GAP = 1000;

const SEARCH_CONFIG: SearchConfig = {
  ftsTable: 'epics_fts', vecTable: 'epics_vec', parentTable: 'epics', parentIdColumn: 'id',
};

export class SqliteEpicsStore implements EpicsStore {
  private meta: MetaHelper;
  private helpers: EntityHelpers;

  constructor(private db: Database.Database, private projectId: number) {
    this.meta = new MetaHelper(db, `${projectId}:${GRAPH}`);
    this.helpers = new EntityHelpers(db, projectId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private toRecord(row: Record<string, unknown>, tags?: string[], progress?: { total: number; done: number }, attachments?: AttachmentMeta[]): EpicRecord {
    const id = num(row.id as bigint);
    return {
      id,
      slug: row.slug as string,
      title: row.title as string,
      description: row.description as string,
      status: row.status as EpicStatus,
      priority: row.priority as TaskPriority,
      tags: tags ?? this.helpers.fetchTags(GRAPH, id),
      order: num(row.order as bigint | number),
      progress: progress ?? this.computeProgress(id),
      attachments: attachments ?? this.helpers.fetchAttachments(GRAPH, id),
      createdAt: num(row.created_at as bigint),
      updatedAt: num(row.updated_at as bigint),
      version: num(row.version as bigint),
      createdById: row.created_by_id ? num(row.created_by_id as bigint) : null,
      updatedById: row.updated_by_id ? num(row.updated_by_id as bigint) : null,
    };
  }

  private toDetail(row: Record<string, unknown>): EpicDetail {
    const record = this.toRecord(row);
    return { ...record, edges: this.helpers.fetchEdges(GRAPH, record.id) };
  }

  private computeProgress(epicId: number): { total: number; done: number } {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN t.status != 'cancelled' THEN 1 ELSE 0 END), 0) AS total,
             COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done
      FROM edges e
      JOIN tasks t ON t.id = e.to_id AND t.project_id = e.project_id
      WHERE e.project_id = ? AND e.from_graph = 'epics' AND e.from_id = ? AND e.to_graph = 'tasks' AND e.kind = 'belongs_to'
    `).get(this.projectId, epicId) as { total: bigint; done: bigint };
    return { total: num(row.total), done: num(row.done) };
  }

  private computeProgressBatch(epicIds: number[]): Map<number, { total: number; done: number }> {
    const result = new Map<number, { total: number; done: number }>();
    if (epicIds.length === 0) return result;
    for (const id of epicIds) result.set(id, { total: 0, done: 0 });

    const ph = epicIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT e.from_id AS epic_id,
        COALESCE(SUM(CASE WHEN t.status != 'cancelled' THEN 1 ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0) AS done
      FROM edges e
      JOIN tasks t ON t.id = e.to_id AND t.project_id = e.project_id
      WHERE e.project_id = ? AND e.from_graph = 'epics' AND e.to_graph = 'tasks' AND e.kind = 'belongs_to'
      AND e.from_id IN (${ph})
      GROUP BY e.from_id
    `).all(this.projectId, ...epicIds) as Array<{ epic_id: bigint; total: bigint; done: bigint }>;

    for (const r of rows) {
      result.set(num(r.epic_id), { total: num(r.total), done: num(r.done) });
    }
    return result;
  }

  // =========================================================================
  // CRUD
  // =========================================================================

  create(data: EpicCreate, embedding: number[]): EpicRecord {
    const slug = randomUUID();
    const ts = now();
    const authorId = data.authorId ?? null;

    const result = this.db.prepare(`
      INSERT INTO epics (project_id, slug, title, description, status, priority, "order", version, created_by_id, updated_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(this.projectId, slug, data.title, data.description ?? '', data.status ?? 'open', data.priority ?? 'medium', this.nextOrder(), authorId, authorId, ts, ts);
    const id = result.lastInsertRowid;

    this.db.prepare('INSERT INTO epics_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id as number | bigint), Buffer.from(new Float32Array(embedding).buffer));

    if (data.tags && data.tags.length > 0) this.helpers.setTags(GRAPH, num(id), data.tags);

    return this.toRecord(this.db.prepare('SELECT * FROM epics WHERE id = ? AND project_id = ?').get(num(id), this.projectId) as Record<string, unknown>);
  }

  update(epicId: number, patch: EpicPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): EpicRecord {
    const row = this.db.prepare('SELECT * FROM epics WHERE id = ? AND project_id = ?').get(epicId, this.projectId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Epic ${epicId} not found`);

    if (expectedVersion !== undefined) {
      const current = num(row.version as bigint);
      if (current !== expectedVersion) throw new VersionConflictError(current, expectedVersion);
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val); };

    if (patch.title !== undefined) set('title', patch.title);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.status !== undefined) set('status', patch.status);
    if (patch.priority !== undefined) set('priority', patch.priority);

    set('version', num(row.version as bigint) + 1);
    set('updated_by_id', authorId ?? null);
    set('updated_at', now());

    params.push(epicId, this.projectId);
    this.db.prepare(`UPDATE epics SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`).run(...params);

    if (embedding) {
      this.db.prepare('DELETE FROM epics_vec WHERE rowid = ?').run(BigInt(epicId));
      this.db.prepare('INSERT INTO epics_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(epicId), Buffer.from(new Float32Array(embedding).buffer));
    }

    if (patch.tags !== undefined) this.helpers.setTags(GRAPH, epicId, patch.tags);

    return this.toRecord(this.db.prepare('SELECT * FROM epics WHERE id = ? AND project_id = ?').get(epicId, this.projectId) as Record<string, unknown>);
  }

  delete(epicId: number): void {
    this.db.prepare('DELETE FROM epics WHERE id = ? AND project_id = ?').run(epicId, this.projectId);
  }

  get(epicId: number): EpicDetail | null {
    const row = this.db.prepare('SELECT * FROM epics WHERE id = ? AND project_id = ?').get(epicId, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toDetail(row) : null;
  }

  getBySlug(slug: string): EpicDetail | null {
    const row = this.db.prepare('SELECT * FROM epics WHERE slug = ? AND project_id = ?').get(slug, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toDetail(row) : null;
  }

  list(opts?: EpicListOptions): { results: EpicRecord[]; total: number } {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const conditions: string[] = ['e.project_id = ?'];
    const params: unknown[] = [this.projectId];

    if (opts?.status) { conditions.push('e.status = ?'); params.push(opts.status); }
    if (opts?.priority) { conditions.push('e.priority = ?'); params.push(opts.priority); }
    if (opts?.filter) { conditions.push('(e.title LIKE ? OR e.description LIKE ?)'); const like = `%${opts.filter}%`; params.push(like, like); }
    if (opts?.tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM edges ed JOIN tags tg ON tg.id = ed.from_id AND tg.project_id = ed.project_id
        WHERE ed.project_id = e.project_id AND ed.to_graph = 'epics' AND ed.to_id = e.id
        AND ed.from_graph = 'tags' AND ed.kind = 'tagged' AND tg.name = ?
      )`);
      params.push(opts.tag);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT e.* FROM epics e WHERE ${where} ORDER BY e."order" LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM epics e WHERE ${where}`).get(...params) as { c: bigint }).c);

    const ids = rows.map(r => num(r.id as bigint));
    const tagsMap = this.helpers.fetchTagsBatch(GRAPH, ids);
    const attachMap = this.helpers.fetchAttachmentsBatch(GRAPH, ids);
    const progressMap = this.computeProgressBatch(ids);

    const results = rows.map(r => {
      const id = num(r.id as bigint);
      return this.toRecord(r, tagsMap.get(id), progressMap.get(id), attachMap.get(id) ?? []);
    });

    return { results, total };
  }

  search(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, SEARCH_CONFIG, query, this.projectId);
  }

  private nextOrder(): number {
    const row = this.db.prepare(`SELECT MAX("order") AS m FROM epics WHERE project_id = ?`).get(this.projectId) as { m: bigint | null };
    return row.m ? num(row.m) + ORDER_GAP : ORDER_GAP;
  }

  // =========================================================================
  // Link / Unlink tasks
  // =========================================================================

  linkTask(epicId: number, taskId: number): void {
    const epic = this.db.prepare('SELECT id FROM epics WHERE id = ? AND project_id = ?').get(epicId, this.projectId);
    if (!epic) throw new Error(`Epic ${epicId} not found`);

    const task = this.db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, this.projectId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    this.db.prepare(`
      INSERT OR IGNORE INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind)
      VALUES (?, 'epics', ?, 'tasks', ?, 'belongs_to')
    `).run(this.projectId, epicId, taskId);
  }

  unlinkTask(epicId: number, taskId: number): void {
    this.db.prepare(`
      DELETE FROM edges
      WHERE project_id = ? AND from_graph = 'epics' AND from_id = ?
      AND to_graph = 'tasks' AND to_id = ? AND kind = 'belongs_to'
    `).run(this.projectId, epicId, taskId);
  }

  // =========================================================================
  // Timestamps
  // =========================================================================

  getUpdatedAt(epicId: number): number | null {
    const row = this.db.prepare('SELECT updated_at FROM epics WHERE id = ? AND project_id = ?').get(epicId, this.projectId) as { updated_at: bigint } | undefined;
    return row ? num(row.updated_at) : null;
  }

  // =========================================================================
  // Meta
  // =========================================================================

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
