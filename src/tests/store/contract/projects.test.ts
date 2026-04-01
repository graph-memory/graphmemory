import { createSqliteStoreFactory } from '../helpers';
import { SqliteStore } from '@/store';

describe('ProjectsStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a project', () => {
    const project = store.projects.create({ slug: 'frontend', name: 'Frontend', directory: '/path/to/fe' });
    expect(project.id).toBeGreaterThan(0);
    expect(project.slug).toBe('frontend');
    expect(project.name).toBe('Frontend');
    expect(project.directory).toBe('/path/to/fe');
    expect(project.createdAt).toBeGreaterThan(0);
  });

  it('enforces slug uniqueness', () => {
    store.projects.create({ slug: 'unique', name: 'A', directory: '/a' });
    expect(() => store.projects.create({ slug: 'unique', name: 'B', directory: '/b' })).toThrow();
  });

  it('gets by id', () => {
    const created = store.projects.create({ slug: 'proj', name: 'Proj', directory: '/p' });
    const fetched = store.projects.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.slug).toBe('proj');
  });

  it('returns null for missing id', () => {
    expect(store.projects.get(999)).toBeNull();
  });

  it('gets by slug', () => {
    store.projects.create({ slug: 'by-slug', name: 'Test', directory: '/t' });
    const fetched = store.projects.getBySlug('by-slug');
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Test');
  });

  it('updates a project', () => {
    const created = store.projects.create({ slug: 'upd', name: 'Old', directory: '/old' });
    const updated = store.projects.update(created.id, { name: 'New', directory: '/new' });
    expect(updated.name).toBe('New');
    expect(updated.directory).toBe('/new');
  });

  it('partial update preserves other fields', () => {
    const created = store.projects.create({ slug: 'partial', name: 'Name', directory: '/dir' });
    const updated = store.projects.update(created.id, { name: 'Changed' });
    expect(updated.name).toBe('Changed');
    expect(updated.directory).toBe('/dir');
  });

  it('throws on update of missing project', () => {
    expect(() => store.projects.update(999, { name: 'X' })).toThrow('not found');
  });

  it('deletes a project', () => {
    const created = store.projects.create({ slug: 'del', name: 'Delete', directory: '/d' });
    store.projects.delete(created.id);
    expect(store.projects.get(created.id)).toBeNull();
  });

  it('cascade deletes knowledge on project delete', () => {
    const project = store.projects.create({ slug: 'cascade', name: 'Cascade', directory: '/c' });
    const db = store.getDb();

    // Insert a knowledge entry directly
    db.prepare(`
      INSERT INTO knowledge (project_id, slug, title, content) VALUES (?, ?, ?, ?)
    `).run(project.id, 'test-note', 'Test', 'Content');

    const before = db.prepare('SELECT COUNT(*) AS c FROM knowledge WHERE project_id = ?').get(project.id) as { c: bigint };
    expect(Number(before.c)).toBe(1);

    store.projects.delete(project.id);

    const after = db.prepare('SELECT COUNT(*) AS c FROM knowledge WHERE project_id = ?').get(project.id) as { c: bigint };
    expect(Number(after.c)).toBe(0);
  });

  it('cascade deletes tasks on project delete', () => {
    const project = store.projects.create({ slug: 'cascade-t', name: 'CT', directory: '/ct' });
    const db = store.getDb();

    db.prepare(`
      INSERT INTO tasks (project_id, slug, title) VALUES (?, ?, ?)
    `).run(project.id, 'test-task', 'Test Task');

    store.projects.delete(project.id);

    const after = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE project_id = ?').get(project.id) as { c: bigint };
    expect(Number(after.c)).toBe(0);
  });

  it('cascade deletes edges on project delete', () => {
    const project = store.projects.create({ slug: 'cascade-e', name: 'CE', directory: '/ce' });
    const db = store.getDb();

    // Create a knowledge entry + edge
    const kResult = db.prepare('INSERT INTO knowledge (project_id, slug, title, content) VALUES (?, ?, ?, ?)').run(project.id, 'n1', 'Note', 'Content');
    const kId = Number(kResult.lastInsertRowid);
    db.prepare('INSERT INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind) VALUES (?, ?, ?, ?, ?, ?)').run(project.id, 'knowledge', kId, 'tasks', 1, 'relates_to');

    const before = Number((db.prepare('SELECT COUNT(*) AS c FROM edges WHERE project_id = ?').get(project.id) as { c: bigint }).c);
    expect(before).toBe(1);

    store.projects.delete(project.id);

    const after = Number((db.prepare('SELECT COUNT(*) AS c FROM edges WHERE project_id = ?').get(project.id) as { c: bigint }).c);
    expect(after).toBe(0);
  });

  it('cascade deletes attachments on project delete', () => {
    const project = store.projects.create({ slug: 'cascade-a', name: 'CA', directory: '/ca' });
    const db = store.getDb();

    db.prepare('INSERT INTO knowledge (project_id, slug, title, content) VALUES (?, ?, ?, ?)').run(project.id, 'n1', 'Note', 'Content');
    db.prepare('INSERT INTO attachments (project_id, graph, entity_id, filename, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)').run(project.id, 'knowledge', 1, 'file.txt', 'text/plain', 100);

    const before = Number((db.prepare('SELECT COUNT(*) AS c FROM attachments WHERE project_id = ?').get(project.id) as { c: bigint }).c);
    expect(before).toBe(1);

    store.projects.delete(project.id);

    const after = Number((db.prepare('SELECT COUNT(*) AS c FROM attachments WHERE project_id = ?').get(project.id) as { c: bigint }).c);
    expect(after).toBe(0);
  });

  it('cascade deletes vec0 entries on project delete', () => {
    const project = store.projects.create({ slug: 'cascade-v', name: 'CV', directory: '/cv' });
    const db = store.getDb();

    const kResult = db.prepare('INSERT INTO knowledge (project_id, slug, title, content) VALUES (?, ?, ?, ?)').run(project.id, 'n1', 'Note', 'Content');
    const embedding = Buffer.from(new Float32Array(384).buffer);
    db.prepare('INSERT INTO knowledge_vec (rowid, embedding) VALUES (?, ?)').run(kResult.lastInsertRowid, embedding);

    const before = Number((db.prepare('SELECT COUNT(*) AS c FROM knowledge_vec').get() as { c: bigint }).c);
    expect(before).toBeGreaterThan(0);

    store.projects.delete(project.id);

    const after = Number((db.prepare('SELECT COUNT(*) AS c FROM knowledge_vec').get() as { c: bigint }).c);
    expect(after).toBe(0);
  });

  it('cascade deletes tags on project delete', () => {
    const project = store.projects.create({ slug: 'cascade-tag', name: 'CT', directory: '/ct' });
    const db = store.getDb();

    db.prepare('INSERT INTO tags (project_id, name) VALUES (?, ?)').run(project.id, 'urgent');

    const before = Number((db.prepare('SELECT COUNT(*) AS c FROM tags WHERE project_id = ?').get(project.id) as { c: bigint }).c);
    expect(before).toBe(1);

    store.projects.delete(project.id);

    const after = Number((db.prepare('SELECT COUNT(*) AS c FROM tags WHERE project_id = ?').get(project.id) as { c: bigint }).c);
    expect(after).toBe(0);
  });

  it('lists projects with pagination', () => {
    store.projects.create({ slug: 'a', name: 'A', directory: '/a' });
    store.projects.create({ slug: 'b', name: 'B', directory: '/b' });
    store.projects.create({ slug: 'c', name: 'C', directory: '/c' });

    const page1 = store.projects.list({ limit: 2, offset: 0 });
    expect(page1.results.length).toBe(2);
    expect(page1.total).toBe(3);

    const page2 = store.projects.list({ limit: 2, offset: 2 });
    expect(page2.results.length).toBe(1);
  });

  it('meta is prefixed with projects:', () => {
    store.projects.setMeta('version', '1');
    expect(store.projects.getMeta('version')).toBe('1');
    expect(store.getMeta('version')).toBeNull();
  });
});
