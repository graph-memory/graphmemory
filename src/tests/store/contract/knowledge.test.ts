import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore, VersionConflictError } from '@/store';
import { SqliteKnowledgeStore } from '@/store/sqlite/stores/knowledge';

describe('KnowledgeStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let knowledge: SqliteKnowledgeStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    knowledge = new SqliteKnowledgeStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- Create ---

  it('creates a note with auto-slug', () => {
    const note = knowledge.create({ title: 'Hello', content: 'World' }, seedEmbedding(1));
    expect(note.id).toBeGreaterThan(0);
    expect(note.slug).toMatch(/^[0-9a-f-]{36}$/); // UUID
    expect(note.title).toBe('Hello');
    expect(note.content).toBe('World');
    expect(note.version).toBe(1);
    expect(note.tags).toEqual([]);
    expect(note.attachments).toEqual([]);
    expect(note.createdAt).toBeGreaterThan(0);
  });

  it('creates with tags', () => {
    const note = knowledge.create({ title: 'Tagged', content: 'Body', tags: ['urgent', 'draft'] }, seedEmbedding(1));
    expect(note.tags).toEqual(['draft', 'urgent']); // sorted
  });

  it('creates with authorId', () => {
    const member = store.team.create({ slug: 'john', name: 'John' });
    const note = knowledge.create({ title: 'By John', content: '', authorId: member.id }, seedEmbedding(1));
    expect(note.createdById).toBe(member.id);
    expect(note.updatedById).toBe(member.id);
  });

  // --- Get ---

  it('gets a note by id with edges', () => {
    const created = knowledge.create({ title: 'Test', content: 'Body' }, seedEmbedding(1));
    const detail = knowledge.get(created.id);
    expect(detail).not.toBeNull();
    expect(detail!.title).toBe('Test');
    expect(detail!.edges).toEqual([]);
  });

  it('gets by slug', () => {
    const created = knowledge.create({ title: 'Slug Test', content: '' }, seedEmbedding(1));
    const detail = knowledge.getBySlug(created.slug);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(created.id);
  });

  it('returns null for missing note', () => {
    expect(knowledge.get(999)).toBeNull();
    expect(knowledge.getBySlug('nonexistent')).toBeNull();
  });

  // --- Update ---

  it('updates title and content', () => {
    const note = knowledge.create({ title: 'Old', content: 'Old body' }, seedEmbedding(1));
    const updated = knowledge.update(note.id, { title: 'New', content: 'New body' }, seedEmbedding(2));
    expect(updated.title).toBe('New');
    expect(updated.content).toBe('New body');
    expect(updated.version).toBe(2);
  });

  it('partial update preserves other fields', () => {
    const note = knowledge.create({ title: 'Keep', content: 'Keep this' }, seedEmbedding(1));
    const updated = knowledge.update(note.id, { title: 'Changed' }, null);
    expect(updated.title).toBe('Changed');
    expect(updated.content).toBe('Keep this');
  });

  it('updates tags', () => {
    const note = knowledge.create({ title: 'T', content: '', tags: ['old'] }, seedEmbedding(1));
    const updated = knowledge.update(note.id, { tags: ['new1', 'new2'] }, null);
    expect(updated.tags).toEqual(['new1', 'new2']);
  });

  it('clears all tags with empty array', () => {
    const note = knowledge.create({ title: 'T', content: '', tags: ['a', 'b'] }, seedEmbedding(1));
    expect(note.tags.length).toBe(2);
    const updated = knowledge.update(note.id, { tags: [] }, null);
    expect(updated.tags).toEqual([]);
  });

  it('throws VersionConflictError on version mismatch', () => {
    const note = knowledge.create({ title: 'V', content: '' }, seedEmbedding(1));
    expect(() => knowledge.update(note.id, { title: 'X' }, null, undefined, 99)).toThrow(VersionConflictError);
  });

  it('passes version check when correct', () => {
    const note = knowledge.create({ title: 'V', content: '' }, seedEmbedding(1));
    const updated = knowledge.update(note.id, { title: 'X' }, null, undefined, 1);
    expect(updated.version).toBe(2);
  });

  // --- Delete ---

  it('deletes a note', () => {
    const note = knowledge.create({ title: 'Del', content: '' }, seedEmbedding(1));
    knowledge.delete(note.id);
    expect(knowledge.get(note.id)).toBeNull();
  });

  it('cleanup trigger removes vec0 on delete', () => {
    const note = knowledge.create({ title: 'Vec', content: '' }, seedEmbedding(1));
    const db = store.getDb();
    const before = Number((db.prepare('SELECT COUNT(*) AS c FROM knowledge_vec').get() as { c: bigint }).c);
    expect(before).toBeGreaterThan(0);

    knowledge.delete(note.id);

    const after = Number((db.prepare('SELECT COUNT(*) AS c FROM knowledge_vec').get() as { c: bigint }).c);
    expect(after).toBe(0);
  });

  // --- List ---

  it('lists notes with pagination', () => {
    knowledge.create({ title: 'A', content: '' }, seedEmbedding(1));
    knowledge.create({ title: 'B', content: '' }, seedEmbedding(2));
    knowledge.create({ title: 'C', content: '' }, seedEmbedding(3));

    const page = knowledge.list({ limit: 2 });
    expect(page.results.length).toBe(2);
    expect(page.total).toBe(3);
  });

  it('lists with text filter', () => {
    knowledge.create({ title: 'SQLite Guide', content: 'About databases' }, seedEmbedding(1));
    knowledge.create({ title: 'React Guide', content: 'About components' }, seedEmbedding(2));

    const result = knowledge.list({ filter: 'SQLite' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('SQLite Guide');
  });

  it('lists with tag filter', () => {
    knowledge.create({ title: 'Tagged', content: '', tags: ['important'] }, seedEmbedding(1));
    knowledge.create({ title: 'Untagged', content: '' }, seedEmbedding(2));

    const result = knowledge.list({ tag: 'important' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('Tagged');
  });

  // --- Pagination edge cases ---

  it('list with offset beyond total returns empty', () => {
    knowledge.create({ title: 'Only', content: '' }, seedEmbedding(1));
    const result = knowledge.list({ offset: 100 });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('creates note with empty content', () => {
    const note = knowledge.create({ title: 'Minimal', content: '' }, seedEmbedding(1));
    expect(note.content).toBe('');
    expect(note.tags).toEqual([]);
  });

  // --- Search ---

  it('searches by keyword', () => {
    knowledge.create({ title: 'SQLite Database', content: 'How to use SQLite' }, seedEmbedding(1));
    knowledge.create({ title: 'React Components', content: 'Building UIs' }, seedEmbedding(2));

    const results = knowledge.search({ text: 'SQLite', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(1); // SQLite note should be first
  });

  it('searches by vector', () => {
    knowledge.create({ title: 'A', content: 'aaa' }, seedEmbedding(1));
    knowledge.create({ title: 'B', content: 'bbb' }, seedEmbedding(2));

    const results = knowledge.search({ embedding: seedEmbedding(1), searchMode: 'vector' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(1); // Closest to seed 1
  });

  it('hybrid search combines keyword and vector', () => {
    knowledge.create({ title: 'Database Schema', content: 'SQLite tables' }, seedEmbedding(1));
    knowledge.create({ title: 'React Guide', content: 'Components' }, seedEmbedding(2));

    const results = knowledge.search({ text: 'database', embedding: seedEmbedding(1), searchMode: 'hybrid' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- Timestamps ---

  it('getUpdatedAt returns timestamp', () => {
    const note = knowledge.create({ title: 'T', content: '' }, seedEmbedding(1));
    const ts = knowledge.getUpdatedAt(note.id);
    expect(ts).toBe(note.updatedAt);
  });

  it('getUpdatedAt returns null for missing note', () => {
    expect(knowledge.getUpdatedAt(999)).toBeNull();
  });

  // --- Meta ---

  it('meta is prefixed', () => {
    knowledge.setMeta('key', 'val');
    expect(knowledge.getMeta('key')).toBe('val');
    expect(store.getMeta('key')).toBeNull();
  });

  // --- Embedding dimension ---

  it('create throws on wrong embedding dimension', () => {
    expect(() => knowledge.create({ title: 'Bad', content: '' }, [1, 2, 3])).toThrow('Embedding dimension mismatch');
  });

  it('update throws on wrong embedding dimension', () => {
    const note = knowledge.create({ title: 'N', content: '' }, seedEmbedding(1));
    expect(() => knowledge.update(note.id, { title: 'N2' }, [1, 2, 3])).toThrow('Embedding dimension mismatch');
  });
});
