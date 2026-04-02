import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  TasksStore,
  TaskCreate,
  TaskImport,
  TaskPatch,
  TaskRecord,
  TaskDetail,
  TaskListOptions,
  TaskStatus,
  TaskPriority,
  AttachmentMeta,
  SearchQuery,
  SearchResult,
} from '../../types';
import { VersionConflictError } from '../../types';
import { MetaHelper } from '../lib/meta';
import { EntityHelpers } from '../lib/entity-helpers';
import { num, now, likeEscape, chunk, assertEmbeddingDim } from '../lib/bigint';
import { hybridSearch, SearchConfig } from '../lib/search';

const GRAPH_TASKS = 'tasks';
const ORDER_GAP = 1000;

const TASK_SEARCH_CONFIG: SearchConfig = {
  ftsTable: 'tasks_fts', vecTable: 'tasks_vec', parentTable: 'tasks', parentIdColumn: 'id',
};

const TERMINAL_STATUSES = new Set<string>(['done', 'cancelled']);

export class SqliteTasksStore implements TasksStore {
  private meta: MetaHelper;
  private helpers: EntityHelpers;

  constructor(private db: Database.Database, private projectId: number, private embeddingDim: number = 384) {
    this.meta = new MetaHelper(db, `${projectId}:${GRAPH_TASKS}`);
    this.helpers = new EntityHelpers(db, projectId);
  }

  // =========================================================================
  // Task CRUD
  // =========================================================================

  private toTaskRecord(row: Record<string, unknown>, tags?: string[], attachments?: AttachmentMeta[]): TaskRecord {
    const id = num(row.id as bigint);
    return {
      id,
      slug: row.slug as string,
      title: row.title as string,
      description: row.description as string,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      tags: tags ?? this.helpers.fetchTags(GRAPH_TASKS, id),
      order: num(row.order as bigint | number),
      dueDate: row.due_date ? num(row.due_date as bigint) : null,
      estimate: row.estimate ? num(row.estimate as bigint) : null,
      completedAt: row.completed_at ? num(row.completed_at as bigint) : null,
      assigneeId: row.assignee_id ? num(row.assignee_id as bigint) : null,
      attachments: attachments ?? this.helpers.fetchAttachments(GRAPH_TASKS, id),
      createdAt: num(row.created_at as bigint),
      updatedAt: num(row.updated_at as bigint),
      version: num(row.version as bigint),
      createdById: row.created_by_id ? num(row.created_by_id as bigint) : null,
      updatedById: row.updated_by_id ? num(row.updated_by_id as bigint) : null,
    };
  }

  private toTaskDetail(row: Record<string, unknown>): TaskDetail {
    const record = this.toTaskRecord(row);
    return { ...record, edges: this.helpers.fetchEdges(GRAPH_TASKS, record.id) };
  }

  create(data: TaskCreate, embedding: number[]): TaskRecord {
    assertEmbeddingDim(embedding, this.embeddingDim);
    const slug = randomUUID();
    const ts = now();
    const status = data.status ?? 'backlog';
    const order = data.order ?? this.nextOrderForStatus(status);
    const authorId = data.authorId ?? null;

    const result = this.db.prepare(`
      INSERT INTO tasks (project_id, slug, title, description, status, priority, "order", due_date, estimate, assignee_id, version, created_by_id, updated_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      this.projectId, slug, data.title, data.description ?? '', status, data.priority ?? 'medium',
      order, data.dueDate ?? null, data.estimate ?? null, data.assigneeId ?? null,
      authorId, authorId, ts, ts,
    );
    const id = result.lastInsertRowid;

    this.db.prepare('INSERT INTO tasks_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id as number | bigint), Buffer.from(new Float32Array(embedding).buffer));

    if (data.tags && data.tags.length > 0) this.helpers.setTags(GRAPH_TASKS, num(id), data.tags);

    return this.toTaskRecord(this.db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(num(id), this.projectId) as Record<string, unknown>);
  }

  update(taskId: number, patch: TaskPatch, embedding: number[] | null, authorId?: number, expectedVersion?: number): TaskRecord {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, this.projectId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Task ${taskId} not found`);

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
    if (patch.dueDate !== undefined) set('due_date', patch.dueDate);
    if (patch.estimate !== undefined) set('estimate', patch.estimate);
    if (patch.assigneeId !== undefined) set('assignee_id', patch.assigneeId);
    if (patch.completedAt !== undefined) set('completed_at', patch.completedAt);
    if (patch.order !== undefined) set('"order"', patch.order);

    set('version', num(row.version as bigint) + 1);
    set('updated_by_id', authorId ?? null);
    set('updated_at', now());

    params.push(taskId, this.projectId);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND project_id = ?`).run(...params);

    if (embedding) {
      assertEmbeddingDim(embedding, this.embeddingDim);
      this.db.prepare('DELETE FROM tasks_vec WHERE rowid = ?').run(BigInt(taskId));
      this.db.prepare('INSERT INTO tasks_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(taskId), Buffer.from(new Float32Array(embedding).buffer));
    }

    if (patch.tags !== undefined) this.helpers.setTags(GRAPH_TASKS, taskId, patch.tags);

    return this.toTaskRecord(this.db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, this.projectId) as Record<string, unknown>);
  }

  delete(taskId: number): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(taskId, this.projectId);
  }

  get(taskId: number): TaskDetail | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toTaskDetail(row) : null;
  }

  getBySlug(slug: string): TaskDetail | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE slug = ? AND project_id = ?').get(slug, this.projectId) as Record<string, unknown> | undefined;
    return row ? this.toTaskDetail(row) : null;
  }

  list(opts?: TaskListOptions): { results: TaskRecord[]; total: number } {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const conditions: string[] = ['t.project_id = ?'];
    const params: unknown[] = [this.projectId];

    if (opts?.status) { conditions.push('t.status = ?'); params.push(opts.status); }
    if (opts?.priority) { conditions.push('t.priority = ?'); params.push(opts.priority); }
    if (opts?.assigneeId) { conditions.push('t.assignee_id = ?'); params.push(opts.assigneeId); }
    if (opts?.filter) { conditions.push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')"); const like = `%${likeEscape(opts.filter)}%`; params.push(like, like); }
    if (opts?.tag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM edges e JOIN tags tg ON tg.id = e.from_id AND tg.project_id = e.project_id
        WHERE e.project_id = t.project_id AND e.to_graph = 'tasks' AND e.to_id = t.id
        AND e.from_graph = 'tags' AND e.kind = 'tagged' AND tg.name = ?
      )`);
      params.push(opts.tag);
    }

    const where = conditions.join(' AND ');
    const rows = this.db.prepare(`SELECT t.* FROM tasks t WHERE ${where} ORDER BY t.status, t."order" LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.db.prepare(`SELECT COUNT(*) AS c FROM tasks t WHERE ${where}`).get(...params) as { c: bigint }).c);

    const ids = rows.map(r => num(r.id as bigint));
    const tagsMap = this.helpers.fetchTagsBatch(GRAPH_TASKS, ids);
    const attachMap = this.helpers.fetchAttachmentsBatch(GRAPH_TASKS, ids);

    const results = rows.map(r => {
      const id = num(r.id as bigint);
      return this.toTaskRecord(r, tagsMap.get(id), attachMap.get(id) ?? []);
    });

    return { results, total };
  }

  search(query: SearchQuery): SearchResult[] {
    return hybridSearch(this.db, TASK_SEARCH_CONFIG, query, this.projectId);
  }

  // =========================================================================
  // Move / reorder
  // =========================================================================

  move(taskId: number, status: TaskStatus, targetOrder?: number, authorId?: number, expectedVersion?: number): TaskRecord {
    const completedAt = TERMINAL_STATUSES.has(status) ? num(now()) : null;
    const order = targetOrder ?? this.nextOrderForStatus(status);
    return this.update(taskId, { status, order, completedAt }, null, authorId, expectedVersion);
  }

  reorder(taskId: number, order: number, status?: TaskStatus, authorId?: number): TaskRecord {
    const patch: TaskPatch = { order };
    if (status) patch.status = status;
    return this.update(taskId, patch, null, authorId);
  }

  nextOrderForStatus(status: TaskStatus): number {
    const row = this.db.prepare(`SELECT MAX("order") AS m FROM tasks WHERE project_id = ? AND status = ?`).get(this.projectId, status) as { m: bigint | null };
    return row.m ? num(row.m) + ORDER_GAP : ORDER_GAP;
  }

  // =========================================================================
  // Timestamps
  // =========================================================================

  getUpdatedAt(taskId: number): number | null {
    const row = this.db.prepare('SELECT updated_at FROM tasks WHERE id = ? AND project_id = ?').get(taskId, this.projectId) as { updated_at: bigint } | undefined;
    return row ? num(row.updated_at) : null;
  }

  // =========================================================================
  // Bulk operations
  // =========================================================================

  bulkDelete(taskIds: number[]): number {
    if (taskIds.length === 0) return 0;
    let total = 0;
    // Cleanup triggers handle edges, attachments, vec0
    for (const batch of chunk(taskIds)) {
      const ph = batch.map(() => '?').join(',');
      const result = this.db.prepare(`DELETE FROM tasks WHERE id IN (${ph}) AND project_id = ?`).run(...batch, this.projectId);
      total += num(result.changes);
    }
    return total;
  }

  bulkMove(taskIds: number[], status: TaskStatus, authorId?: number): number {
    if (taskIds.length === 0) return 0;
    const ts = now();
    const completedAt = TERMINAL_STATUSES.has(status) ? ts : null;
    let total = 0;
    for (const batch of chunk(taskIds)) {
      const ph = batch.map(() => '?').join(',');
      const result = this.db.prepare(`
        UPDATE tasks SET status = ?, completed_at = ?, version = version + 1, updated_by_id = ?, updated_at = ?
        WHERE id IN (${ph}) AND project_id = ?
      `).run(status, completedAt, authorId ?? null, ts, ...batch, this.projectId);
      total += num(result.changes);
    }
    return total;
  }

  bulkPriority(taskIds: number[], priority: TaskPriority, authorId?: number): number {
    if (taskIds.length === 0) return 0;
    const ts = now();
    let total = 0;
    for (const batch of chunk(taskIds)) {
      const ph = batch.map(() => '?').join(',');
      const result = this.db.prepare(`
        UPDATE tasks SET priority = ?, version = version + 1, updated_by_id = ?, updated_at = ?
        WHERE id IN (${ph}) AND project_id = ?
      `).run(priority, authorId ?? null, ts, ...batch, this.projectId);
      total += num(result.changes);
    }
    return total;
  }

  // =========================================================================
  // Meta
  // =========================================================================

  importRecord(data: TaskImport, embedding: number[]): TaskRecord {
    assertEmbeddingDim(embedding, this.embeddingDim);

    const existing = this.db.prepare('SELECT * FROM tasks WHERE slug = ? AND project_id = ?').get(data.slug, this.projectId) as Record<string, unknown> | undefined;

    if (existing) {
      const id = num(existing.id as bigint);
      this.db.prepare(`
        UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?,
        due_date = ?, estimate = ?, completed_at = ?, "order" = ?,
        version = ?, updated_at = ?
        WHERE id = ? AND project_id = ?
      `).run(
        data.title, data.description, data.status, data.priority,
        data.dueDate ?? null, data.estimate ?? null, data.completedAt ?? null,
        data.order ?? num(existing.order as bigint | number),
        data.version, data.updatedAt, id, this.projectId,
      );

      this.db.prepare('DELETE FROM tasks_vec WHERE rowid = ?').run(BigInt(id));
      this.db.prepare('INSERT INTO tasks_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id), Buffer.from(new Float32Array(embedding).buffer));

      if (data.tags) this.helpers.setTags(GRAPH_TASKS, id, data.tags);

      return this.toTaskRecord(this.db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(id, this.projectId) as Record<string, unknown>);
    }

    const order = data.order ?? this.nextOrderForStatus(data.status);
    const result = this.db.prepare(`
      INSERT INTO tasks (project_id, slug, title, description, status, priority, "order", due_date, estimate, completed_at, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.projectId, data.slug, data.title, data.description, data.status, data.priority,
      order, data.dueDate ?? null, data.estimate ?? null, data.completedAt ?? null,
      data.version, data.createdAt, data.updatedAt,
    );
    const id = num(result.lastInsertRowid);

    this.db.prepare('INSERT INTO tasks_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id), Buffer.from(new Float32Array(embedding).buffer));

    if (data.tags && data.tags.length > 0) this.helpers.setTags(GRAPH_TASKS, id, data.tags);

    return this.toTaskRecord(this.db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(id, this.projectId) as Record<string, unknown>);
  }

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
