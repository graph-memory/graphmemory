import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore } from '@/store';
import { SqliteEpicsStore } from '@/store/sqlite/stores/epics';
import { SqliteTasksStore } from '@/store/sqlite/stores/tasks';

describe('EpicsStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let epics: SqliteEpicsStore;
  let tasks: SqliteTasksStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    epics = new SqliteEpicsStore(store.getDb(), projectId);
    tasks = new SqliteTasksStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- CRUD ---

  it('creates an epic', () => {
    const epic = epics.create({ title: 'MVP', description: 'Minimum viable product' }, seedEmbedding(1));
    expect(epic.id).toBeGreaterThan(0);
    expect(epic.status).toBe('open');
    expect(epic.priority).toBe('medium');
    expect(epic.progress).toEqual({ total: 0, done: 0 });
  });

  it('gets epic detail', () => {
    const epic = epics.create({ title: 'Epic', description: '' }, seedEmbedding(1));
    const detail = epics.get(epic.id);
    expect(detail).not.toBeNull();
    expect(detail!.edges).toEqual([]);
  });

  it('updates an epic', () => {
    const epic = epics.create({ title: 'Old', description: '' }, seedEmbedding(1));
    const updated = epics.update(epic.id, { title: 'New', status: 'in_progress' }, null);
    expect(updated.title).toBe('New');
    expect(updated.status).toBe('in_progress');
    expect(updated.version).toBe(2);
  });

  it('deletes an epic', () => {
    const epic = epics.create({ title: 'Del', description: '' }, seedEmbedding(1));
    epics.delete(epic.id);
    expect(epics.get(epic.id)).toBeNull();
  });

  it('getBySlug works', () => {
    const epic = epics.create({ title: 'Slug', description: '' }, seedEmbedding(1));
    const found = epics.getBySlug(epic.slug);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(epic.id);
  });

  it('getBySlug returns null for missing slug', () => {
    expect(epics.getBySlug('nonexistent')).toBeNull();
  });

  // --- Search ---

  it('search by keyword', () => {
    epics.create({ title: 'MVP Release', description: 'Ship it' }, seedEmbedding(1));
    epics.create({ title: 'Tech Debt', description: 'Cleanup' }, seedEmbedding(2));

    const results = epics.search({ text: 'MVP', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- List ---

  it('list with status filter', () => {
    epics.create({ title: 'Open', description: '' }, seedEmbedding(1));
    epics.create({ title: 'Closed', description: '', status: 'done' }, seedEmbedding(2));

    const result = epics.list({ status: 'open' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('Open');
  });

  // --- Progress ---

  it('progress reflects linked tasks', () => {
    const epic = epics.create({ title: 'Progress', description: '' }, seedEmbedding(1));
    const t1 = tasks.create({ title: 'T1', description: '' }, seedEmbedding(2));
    const t2 = tasks.create({ title: 'T2', description: '' }, seedEmbedding(3));

    epics.linkTask(epic.id, t1.id);
    epics.linkTask(epic.id, t2.id);

    // Mark one done
    tasks.move(t1.id, 'done');

    const epicDetail = epics.get(epic.id)!;
    expect(epicDetail.progress).toEqual({ total: 2, done: 1 });
  });

  // --- linkTask / unlinkTask ---

  it('linkTask creates edge', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    epics.linkTask(epic.id, task.id);

    const detail = epics.get(epic.id)!;
    expect(detail.progress.total).toBe(1);
  });

  it('unlinkTask removes edge', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    epics.linkTask(epic.id, task.id);
    epics.unlinkTask(epic.id, task.id);

    const detail = epics.get(epic.id)!;
    expect(detail.progress.total).toBe(0);
  });

  it('linkTask throws for nonexistent epic', () => {
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(1));
    expect(() => epics.linkTask(999, task.id)).toThrow('Epic 999 not found');
  });

  it('linkTask throws for nonexistent task', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    expect(() => epics.linkTask(epic.id, 999)).toThrow('Task 999 not found');
  });

  it('linkTask is idempotent', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(2));

    epics.linkTask(epic.id, task.id);
    epics.linkTask(epic.id, task.id); // should not throw

    expect(epics.get(epic.id)!.progress.total).toBe(1);
  });

  // --- Reorder ---

  it('reorders an epic', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    const reordered = epics.reorder(epic.id, 5000);
    expect(reordered.order).toBe(5000);
    expect(reordered.version).toBe(2);
  });

  // --- Version conflict ---

  it('update throws on version conflict', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    expect(() => epics.update(epic.id, { title: 'X' }, null, undefined, 99)).toThrow('Version conflict');
  });

  it('update with embedding replaces vec0', () => {
    const epic = epics.create({ title: 'E', description: '' }, seedEmbedding(1));
    const updated = epics.update(epic.id, { title: 'E2' }, seedEmbedding(2));
    expect(updated.title).toBe('E2');
    // Verify vector search still works after replacement
    const results = epics.search({ embedding: seedEmbedding(2), searchMode: 'vector' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(epic.id);
  });

  // --- Tag filter ---

  it('list with tag filter', () => {
    epics.create({ title: 'Tagged', description: '', tags: ['important'] }, seedEmbedding(1));
    epics.create({ title: 'Untagged', description: '' }, seedEmbedding(2));

    const result = epics.list({ tag: 'important' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('Tagged');
  });

  // --- Embedding dim mismatch ---

  it('create throws on wrong embedding dimension', () => {
    expect(() => epics.create({ title: 'Bad', description: '' }, [1, 2, 3])).toThrow('Embedding dimension mismatch');
  });

  // --- Hybrid search ---

  it('hybrid search combines keyword and vector', () => {
    epics.create({ title: 'MVP Release', description: 'Ship it' }, seedEmbedding(1));
    epics.create({ title: 'Tech Debt', description: 'Cleanup' }, seedEmbedding(2));

    const results = epics.search({ text: 'MVP', embedding: seedEmbedding(1), searchMode: 'hybrid' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- Pagination edge cases ---

  it('list with offset beyond total returns empty', () => {
    epics.create({ title: 'Only', description: '' }, seedEmbedding(1));
    const result = epics.list({ offset: 100 });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(1);
  });

  // --- Null/empty input ---

  it('creates epic with empty description', () => {
    const epic = epics.create({ title: 'Minimal', description: '' }, seedEmbedding(1));
    expect(epic.description).toBe('');
  });

  // --- Timestamps ---

  it('getUpdatedAt works', () => {
    const epic = epics.create({ title: 'T', description: '' }, seedEmbedding(1));
    expect(epics.getUpdatedAt(epic.id)).toBe(epic.updatedAt);
    expect(epics.getUpdatedAt(999)).toBeNull();
  });

  // --- Meta ---

  it('meta is scoped', () => {
    epics.setMeta('key', 'val');
    expect(epics.getMeta('key')).toBe('val');
    epics.deleteMeta('key');
    expect(epics.getMeta('key')).toBeNull();
  });
});
