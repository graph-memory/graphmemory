import { createSqliteStoreFactory } from '../helpers';
import { MetaHelper } from '@/store/sqlite/lib/meta';
import { SqliteStore } from '@/store';

describe('SQLite MetaHelper', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => {
    cleanup();
  });

  it('get/set/delete with no prefix', () => {
    store.setMeta('key1', 'value1');
    expect(store.getMeta('key1')).toBe('value1');

    store.deleteMeta('key1');
    expect(store.getMeta('key1')).toBeNull();
  });

  it('returns null for missing key', () => {
    expect(store.getMeta('nonexistent')).toBeNull();
  });

  it('overwrites existing value', () => {
    store.setMeta('key', 'old');
    store.setMeta('key', 'new');
    expect(store.getMeta('key')).toBe('new');
  });

  it('prefixed helpers are isolated', () => {
    const db = store.getDb();
    const team = new MetaHelper(db, 'team');
    const project = new MetaHelper(db, 'project');

    team.setMeta('version', '1');
    project.setMeta('version', '2');

    expect(team.getMeta('version')).toBe('1');
    expect(project.getMeta('version')).toBe('2');

    // Check actual keys in DB
    const rows = db.prepare('SELECT key FROM meta ORDER BY key').all() as Array<{ key: string }>;
    const keys = rows.map(r => r.key);
    expect(keys).toContain('project:version');
    expect(keys).toContain('team:version');
  });

  it('delete does not affect other prefixes', () => {
    const db = store.getDb();
    const a = new MetaHelper(db, 'a');
    const b = new MetaHelper(db, 'b');

    a.setMeta('key', 'aaa');
    b.setMeta('key', 'bbb');

    a.deleteMeta('key');
    expect(a.getMeta('key')).toBeNull();
    expect(b.getMeta('key')).toBe('bbb');
  });

  it('project-scoped stores have isolated meta per project', () => {
    const p1 = store.projects.create({ slug: 'p1', name: 'P1', directory: '/p1' });
    const p2 = store.projects.create({ slug: 'p2', name: 'P2', directory: '/p2' });

    const scoped1 = store.project(p1.id);
    const scoped2 = store.project(p2.id);

    scoped1.knowledge.setMeta('cursor', 'aaa');
    scoped2.knowledge.setMeta('cursor', 'bbb');

    expect(scoped1.knowledge.getMeta('cursor')).toBe('aaa');
    expect(scoped2.knowledge.getMeta('cursor')).toBe('bbb');

    scoped1.knowledge.deleteMeta('cursor');
    expect(scoped1.knowledge.getMeta('cursor')).toBeNull();
    expect(scoped2.knowledge.getMeta('cursor')).toBe('bbb');
  });
});
