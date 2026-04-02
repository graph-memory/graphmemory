import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore, VersionConflictError } from '@/store';
import { SqliteTasksStore } from '@/store/sqlite/stores/tasks';

describe('TasksStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let tasks: SqliteTasksStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    tasks = new SqliteTasksStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- Task CRUD ---

  it('creates a task with defaults', () => {
    const task = tasks.create({ title: 'Fix bug', description: 'Something broken' }, seedEmbedding(1));
    expect(task.id).toBeGreaterThan(0);
    expect(task.slug).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('medium');
    expect(task.version).toBe(1);
    expect(task.order).toBeGreaterThan(0);
    expect(task.completedAt).toBeNull();
    expect(task.tags).toEqual([]);
  });

  it('creates with all fields', () => {
    const member = store.team.create({ slug: 'dev', name: 'Dev' });
    const task = tasks.create({
      title: 'Full', description: 'All fields',
      status: 'todo', priority: 'high', tags: ['urgent'],
      dueDate: 1700000000000, estimate: 4, assigneeId: member.id, authorId: member.id,
    }, seedEmbedding(1));
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('high');
    expect(task.tags).toEqual(['urgent']);
    expect(task.dueDate).toBe(1700000000000);
    expect(task.estimate).toBe(4);
    expect(task.assigneeId).toBe(member.id);
    expect(task.createdById).toBe(member.id);
  });

  it('gets task detail with edges', () => {
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(1));
    const detail = tasks.get(task.id);
    expect(detail).not.toBeNull();
    expect(detail!.edges).toEqual([]);
  });

  it('gets by slug', () => {
    const task = tasks.create({ title: 'Slug', description: '' }, seedEmbedding(1));
    const detail = tasks.getBySlug(task.slug);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(task.id);
  });

  it('updates a task', () => {
    const task = tasks.create({ title: 'Old', description: '' }, seedEmbedding(1));
    const updated = tasks.update(task.id, { title: 'New', priority: 'critical' }, null);
    expect(updated.title).toBe('New');
    expect(updated.priority).toBe('critical');
    expect(updated.version).toBe(2);
  });

  it('throws VersionConflictError', () => {
    const task = tasks.create({ title: 'V', description: '' }, seedEmbedding(1));
    expect(() => tasks.update(task.id, { title: 'X' }, null, undefined, 99)).toThrow(VersionConflictError);
  });

  it('deletes a task', () => {
    const task = tasks.create({ title: 'Del', description: '' }, seedEmbedding(1));
    tasks.delete(task.id);
    expect(tasks.get(task.id)).toBeNull();
  });

  // --- Move ---

  it('move to done sets completedAt', () => {
    const task = tasks.create({ title: 'Move', description: '' }, seedEmbedding(1));
    const moved = tasks.move(task.id, 'done');
    expect(moved.status).toBe('done');
    expect(moved.completedAt).toBeGreaterThan(0);
  });

  it('move away from done clears completedAt', () => {
    const task = tasks.create({ title: 'Move', description: '' }, seedEmbedding(1));
    tasks.move(task.id, 'done');
    const moved = tasks.move(task.id, 'todo');
    expect(moved.status).toBe('todo');
    expect(moved.completedAt).toBeNull();
  });

  it('move with version conflict throws', () => {
    const task = tasks.create({ title: 'MV', description: '' }, seedEmbedding(1));
    expect(() => tasks.move(task.id, 'done', undefined, undefined, 99)).toThrow(VersionConflictError);
  });

  // --- Reorder ---

  it('reorders a task', () => {
    const task = tasks.create({ title: 'R', description: '' }, seedEmbedding(1));
    const reordered = tasks.reorder(task.id, 5000);
    expect(reordered.order).toBe(5000);
  });

  // --- nextOrderForStatus ---

  it('nextOrderForStatus returns ORDER_GAP for empty column', () => {
    expect(tasks.nextOrderForStatus('todo')).toBe(1000);
  });

  it('nextOrderForStatus increments by ORDER_GAP', () => {
    tasks.create({ title: 'A', description: '', status: 'todo' }, seedEmbedding(1));
    expect(tasks.nextOrderForStatus('todo')).toBe(2000);
  });

  // --- List ---

  it('lists with status filter', () => {
    tasks.create({ title: 'A', description: '', status: 'todo' }, seedEmbedding(1));
    tasks.create({ title: 'B', description: '', status: 'done' }, seedEmbedding(2));

    const result = tasks.list({ status: 'todo' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('A');
  });

  it('lists with tag filter', () => {
    tasks.create({ title: 'Tagged', description: '', tags: ['bug'] }, seedEmbedding(1));
    tasks.create({ title: 'Untagged', description: '' }, seedEmbedding(2));

    const result = tasks.list({ tag: 'bug' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('Tagged');
  });

  it('lists with text filter', () => {
    tasks.create({ title: 'Fix database bug', description: '' }, seedEmbedding(1));
    tasks.create({ title: 'Add feature', description: '' }, seedEmbedding(2));

    const result = tasks.list({ filter: 'database' });
    expect(result.results.length).toBe(1);
  });

  // --- Bulk operations ---

  it('bulkDelete removes multiple tasks', () => {
    const t1 = tasks.create({ title: 'A', description: '' }, seedEmbedding(1));
    const t2 = tasks.create({ title: 'B', description: '' }, seedEmbedding(2));
    tasks.create({ title: 'C', description: '' }, seedEmbedding(3));

    const count = tasks.bulkDelete([t1.id, t2.id]);
    expect(count).toBe(2);
    expect(tasks.list().total).toBe(1);
  });

  it('bulkMove changes status for multiple tasks', () => {
    const t1 = tasks.create({ title: 'A', description: '' }, seedEmbedding(1));
    const t2 = tasks.create({ title: 'B', description: '' }, seedEmbedding(2));

    const count = tasks.bulkMove([t1.id, t2.id], 'done');
    expect(count).toBe(2);

    const a = tasks.get(t1.id)!;
    expect(a.status).toBe('done');
    expect(a.completedAt).toBeGreaterThan(0);
  });

  it('bulkMove to non-terminal clears completedAt', () => {
    const t1 = tasks.create({ title: 'A', description: '' }, seedEmbedding(1));
    tasks.bulkMove([t1.id], 'done');
    expect(tasks.get(t1.id)!.completedAt).toBeGreaterThan(0);

    tasks.bulkMove([t1.id], 'todo');
    expect(tasks.get(t1.id)!.completedAt).toBeNull();
  });

  it('bulkPriority changes priority', () => {
    const t1 = tasks.create({ title: 'A', description: '' }, seedEmbedding(1));
    const t2 = tasks.create({ title: 'B', description: '' }, seedEmbedding(2));

    const count = tasks.bulkPriority([t1.id, t2.id], 'critical');
    expect(count).toBe(2);
    expect(tasks.get(t1.id)!.priority).toBe('critical');
  });

  // --- Search ---

  it('searches tasks by keyword', () => {
    tasks.create({ title: 'Fix SQLite bug', description: 'Database issue' }, seedEmbedding(1));
    tasks.create({ title: 'Add feature', description: 'New UI' }, seedEmbedding(2));

    const results = tasks.search({ text: 'SQLite', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- List filters (additional) ---

  it('lists with assigneeId filter', () => {
    const member = store.team.create({ slug: 'dev', name: 'Dev' });
    tasks.create({ title: 'Assigned', description: '', assigneeId: member.id }, seedEmbedding(1));
    tasks.create({ title: 'Unassigned', description: '' }, seedEmbedding(2));

    const result = tasks.list({ assigneeId: member.id });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('Assigned');
  });

  it('lists with priority filter', () => {
    tasks.create({ title: 'High', description: '', priority: 'high' }, seedEmbedding(1));
    tasks.create({ title: 'Low', description: '', priority: 'low' }, seedEmbedding(2));

    const result = tasks.list({ priority: 'high' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('High');
  });

  // --- Timestamps ---

  it('getUpdatedAt works', () => {
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(1));
    expect(tasks.getUpdatedAt(task.id)).toBe(task.updatedAt);
    expect(tasks.getUpdatedAt(999)).toBeNull();
  });

  // --- Hybrid search ---

  it('hybrid search combines keyword and vector', () => {
    tasks.create({ title: 'Fix SQLite bug', description: 'Database issue' }, seedEmbedding(1));
    tasks.create({ title: 'Add feature', description: 'New UI' }, seedEmbedding(2));

    const results = tasks.search({ text: 'SQLite', embedding: seedEmbedding(1), searchMode: 'hybrid' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- Pagination edge cases ---

  it('list with offset beyond total returns empty', () => {
    tasks.create({ title: 'Only', description: '' }, seedEmbedding(1));
    const result = tasks.list({ offset: 100 });
    expect(result.results).toEqual([]);
    expect(result.total).toBe(1);
  });

  // --- Null/empty input ---

  it('creates task with empty description', () => {
    const task = tasks.create({ title: 'Minimal', description: '' }, seedEmbedding(1));
    expect(task.description).toBe('');
  });

  it('creates task with null optional fields', () => {
    const task = tasks.create({
      title: 'T', description: '', dueDate: null, estimate: null, assigneeId: null,
    }, seedEmbedding(1));
    expect(task.dueDate).toBeNull();
    expect(task.estimate).toBeNull();
    expect(task.assigneeId).toBeNull();
  });

  // --- Orphaned tags cleanup ---

  it('updating tags cleans up orphaned tags', () => {
    const task = tasks.create({ title: 'T', description: '', tags: ['old-tag'] }, seedEmbedding(1));
    const db = store.getDb();

    // Verify tag exists
    const before = Number((db.prepare("SELECT COUNT(*) AS c FROM tags WHERE project_id = ? AND name = 'old-tag'").get(projectId) as { c: bigint }).c);
    expect(before).toBe(1);

    // Update to new tags — old-tag should be removed
    tasks.update(task.id, { tags: ['new-tag'] }, null);

    const after = Number((db.prepare("SELECT COUNT(*) AS c FROM tags WHERE project_id = ? AND name = 'old-tag'").get(projectId) as { c: bigint }).c);
    expect(after).toBe(0);
  });

  // --- Embedding dimension ---

  it('create throws on wrong embedding dimension', () => {
    expect(() => tasks.create({ title: 'Bad', description: '' }, [1, 2, 3])).toThrow('Embedding dimension mismatch');
  });

  it('update throws on wrong embedding dimension', () => {
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(1));
    expect(() => tasks.update(task.id, { title: 'T2' }, [1, 2, 3])).toThrow('Embedding dimension mismatch');
  });
});
