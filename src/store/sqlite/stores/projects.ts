import Database from 'better-sqlite3';
import type {
  ProjectsStore,
  ProjectCreate,
  ProjectPatch,
  ProjectRecord,
  PaginationOptions,
} from '../../types';
import { MetaHelper } from '../lib/meta';
import { num, now } from '../lib/bigint';

export class SqliteProjectsStore implements ProjectsStore {
  private meta: MetaHelper;
  private stmts: ReturnType<SqliteProjectsStore['prepareStatements']>;

  constructor(private db: Database.Database) {
    this.meta = new MetaHelper(db, 'projects');
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO projects (slug, name, directory, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      update: this.db.prepare(`
        UPDATE projects SET name = ?, directory = ?, updated_at = ?
        WHERE id = ?
      `),
      delete: this.db.prepare('DELETE FROM projects WHERE id = ?'),
      getById: this.db.prepare('SELECT * FROM projects WHERE id = ?'),
      getBySlug: this.db.prepare('SELECT * FROM projects WHERE slug = ?'),
      list: this.db.prepare('SELECT * FROM projects ORDER BY name LIMIT ? OFFSET ?'),
      count: this.db.prepare('SELECT COUNT(*) AS c FROM projects'),
    };
  }

  private toRecord(row: Record<string, unknown>): ProjectRecord {
    return {
      id: num(row.id as bigint),
      slug: row.slug as string,
      name: row.name as string,
      directory: row.directory as string,
      createdAt: num(row.created_at as bigint),
      updatedAt: num(row.updated_at as bigint),
    };
  }

  create(data: ProjectCreate): ProjectRecord {
    const ts = now();
    const result = this.stmts.insert.run(data.slug, data.name, data.directory, ts, ts);
    return this.get(num(result.lastInsertRowid))!;
  }

  update(projectId: number, patch: ProjectPatch): ProjectRecord {
    const existing = this.get(projectId);
    if (!existing) throw new Error(`Project ${projectId} not found`);

    this.stmts.update.run(
      patch.name ?? existing.name,
      patch.directory ?? existing.directory,
      now(),
      projectId,
    );
    return this.get(projectId)!;
  }

  delete(projectId: number): void {
    // CASCADE on FK handles: knowledge, tasks, epics, skills, code, docs, files, edges, tags
    // Cleanup triggers on each entity table handle: vec0, edges, attachments
    // But we need to clean vec0 for entities BEFORE cascade deletes them,
    // because triggers fire per-row — which is fine, SQLite does this automatically.
    this.stmts.delete.run(projectId);
  }

  get(projectId: number): ProjectRecord | null {
    const row = this.stmts.getById.get(projectId) as Record<string, unknown> | undefined;
    return row ? this.toRecord(row) : null;
  }

  getBySlug(slug: string): ProjectRecord | null {
    const row = this.stmts.getBySlug.get(slug) as Record<string, unknown> | undefined;
    return row ? this.toRecord(row) : null;
  }

  list(pagination?: PaginationOptions): { results: ProjectRecord[]; total: number } {
    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const rows = this.stmts.list.all(limit, offset) as Array<Record<string, unknown>>;
    const total = num((this.stmts.count.get() as { c: bigint }).c);
    return { results: rows.map(r => this.toRecord(r)), total };
  }

  getMeta(key: string): string | null { return this.meta.getMeta(key); }
  setMeta(key: string, value: string): void { this.meta.setMeta(key, value); }
  deleteMeta(key: string): void { this.meta.deleteMeta(key); }
}
