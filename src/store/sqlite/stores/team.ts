import Database from 'better-sqlite3';
import type {
  TeamStore,
  TeamMemberCreate,
  TeamMemberPatch,
  TeamMemberRecord,
  PaginationOptions,
} from '../../types';
import { MetaHelper } from '../lib/meta';
import { num, now } from '../lib/bigint';

export class SqliteTeamStore implements TeamStore {
  private meta: MetaHelper;
  private stmts: ReturnType<SqliteTeamStore['prepareStatements']>;

  constructor(private db: Database.Database) {
    this.meta = new MetaHelper(db, 'team');
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO team_members (slug, name, email, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      update: this.db.prepare(`
        UPDATE team_members SET name = ?, email = ?, role = ?, updated_at = ?
        WHERE id = ?
      `),
      delete: this.db.prepare('DELETE FROM team_members WHERE id = ?'),
      getById: this.db.prepare('SELECT * FROM team_members WHERE id = ?'),
      getBySlug: this.db.prepare('SELECT * FROM team_members WHERE slug = ?'),
      list: this.db.prepare('SELECT * FROM team_members ORDER BY name LIMIT ? OFFSET ?'),
      count: this.db.prepare('SELECT COUNT(*) AS c FROM team_members'),
    };
  }

  private toRecord(row: Record<string, unknown>): TeamMemberRecord {
    return {
      id: num(row.id as bigint),
      slug: row.slug as string,
      name: row.name as string,
      email: (row.email as string) ?? null,
      role: (row.role as string) ?? null,
      createdAt: num(row.created_at as bigint),
      updatedAt: num(row.updated_at as bigint),
    };
  }

  create(data: TeamMemberCreate): TeamMemberRecord {
    const ts = now();
    const result = this.stmts.insert.run(
      data.slug, data.name, data.email ?? null, data.role ?? null, ts, ts,
    );
    return this.get(num(result.lastInsertRowid))!;
  }

  update(memberId: number, patch: TeamMemberPatch): TeamMemberRecord {
    const existing = this.get(memberId);
    if (!existing) throw new Error(`Team member ${memberId} not found`);

    this.stmts.update.run(
      patch.name ?? existing.name,
      patch.email !== undefined ? patch.email : existing.email,
      patch.role !== undefined ? patch.role : existing.role,
      now(),
      memberId,
    );
    return this.get(memberId)!;
  }

  delete(memberId: number): void {
    this.stmts.delete.run(memberId);
  }

  get(memberId: number): TeamMemberRecord | null {
    const row = this.stmts.getById.get(memberId) as Record<string, unknown> | undefined;
    return row ? this.toRecord(row) : null;
  }

  getBySlug(slug: string): TeamMemberRecord | null {
    const row = this.stmts.getBySlug.get(slug) as Record<string, unknown> | undefined;
    return row ? this.toRecord(row) : null;
  }

  upsertBySlug(data: TeamMemberCreate): TeamMemberRecord {
    const existing = this.getBySlug(data.slug);
    if (existing) {
      // Only patch fields that differ to avoid bumping updated_at unnecessarily.
      const patch: TeamMemberPatch = {};
      if (data.name !== existing.name) patch.name = data.name;
      if ((data.email ?? null) !== existing.email) patch.email = data.email;
      if ((data.role ?? null) !== existing.role) patch.role = data.role;
      if (Object.keys(patch).length > 0) return this.update(existing.id, patch);
      return existing;
    }
    return this.create(data);
  }

  list(pagination?: PaginationOptions): { results: TeamMemberRecord[]; total: number } {
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
