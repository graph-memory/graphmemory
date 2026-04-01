import { createSqliteStoreFactory } from '../helpers';
import { getSchemaVersion } from '../../../store/sqlite/lib/migrate';
import { SqliteStore } from '../../../store';

describe('SQLite migrations', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => {
    cleanup();
  });

  it('applies v001 migration on first open', () => {
    const db = store.getDb();
    const version = getSchemaVersion(db);
    expect(version).toBe(1);
  });

  it('creates all expected tables', () => {
    const db = store.getDb();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    const names = tables.map(t => t.name);

    // Workspace-level
    expect(names).toContain('meta');
    expect(names).toContain('projects');
    expect(names).toContain('team_members');
    expect(names).toContain('tags');
    expect(names).toContain('attachments');
    expect(names).toContain('edges');

    // Knowledge
    expect(names).toContain('knowledge');

    // Tasks + Epics
    expect(names).toContain('tasks');
    expect(names).toContain('epics');

    // Skills
    expect(names).toContain('skills');

    // Code (single table)
    expect(names).toContain('code');

    // Docs (single table)
    expect(names).toContain('docs');

    // Files (single table)
    expect(names).toContain('files');
  });

  it('creates FTS5 virtual tables', () => {
    const db = store.getDb();
    const vtables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE '%_fts'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    const names = vtables.map(t => t.name);
    expect(names).toContain('knowledge_fts');
    expect(names).toContain('tasks_fts');
    expect(names).toContain('epics_fts');
    expect(names).toContain('skills_fts');
    expect(names).toContain('code_fts');
    expect(names).toContain('docs_fts');
  });

  it('is idempotent on re-open', () => {
    const db = store.getDb();
    const v1 = getSchemaVersion(db);

    const { runMigrations } = require('../../../store/sqlite/lib/migrate');
    const { v001 } = require('../../../store/sqlite/migrations/v001');
    const applied = runMigrations(db, [v001]);

    expect(applied).toBe(0);
    expect(getSchemaVersion(db)).toBe(v1);
  });
});
