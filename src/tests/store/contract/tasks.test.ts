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

  // --- Epic CRUD ---

  it('creates an epic', () => {
    const epic = tasks.createEpic({ title: 'MVP', description: 'Minimum viable product' }, seedEmbedding(1));
    expect(epic.id).toBeGreaterThan(0);
    expect(epic.status).toBe('open');
    expect(epic.priority).toBe('medium');
    expect(epic.progress).toEqual({ total: 0, done: 0 });
  });

  it('gets epic detail', () => {
    const epic = tasks.createEpic({ title: 'Epic', description: '' }, seedEmbedding(1));
    const detail = tasks.getEpic(epic.id);
    expect(detail).not.toBeNull();
    expect(detail!.edges).toEqual([]);
  });

  it('updates an epic', () => {
    const epic = tasks.createEpic({ title: 'Old', description: '' }, seedEmbedding(1));
    const updated = tasks.updateEpic(epic.id, { title: 'New', status: 'in_progress' }, null);
    expect(updated.title).toBe('New');
    expect(updated.status).toBe('in_progress');
    expect(updated.version).toBe(2);
  });

  it('deletes an epic', () => {
    const epic = tasks.createEpic({ title: 'Del', description: '' }, seedEmbedding(1));
    tasks.deleteEpic(epic.id);
    expect(tasks.getEpic(epic.id)).toBeNull();
  });

  it('epic progress reflects linked tasks', () => {
    const epic = tasks.createEpic({ title: 'Progress', description: '' }, seedEmbedding(1));
    const t1 = tasks.create({ title: 'T1', description: '' }, seedEmbedding(2));
    const t2 = tasks.create({ title: 'T2', description: '' }, seedEmbedding(3));

    // Link tasks to epic via edges
    const db = store.getDb();
    db.prepare(`INSERT INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind) VALUES (?, 'epics', ?, 'tasks', ?, 'belongs_to')`).run(projectId, epic.id, t1.id);
    db.prepare(`INSERT INTO edges (project_id, from_graph, from_id, to_graph, to_id, kind) VALUES (?, 'epics', ?, 'tasks', ?, 'belongs_to')`).run(projectId, epic.id, t2.id);

    // Mark one done
    tasks.move(t1.id, 'done');

    const epicDetail = tasks.getEpic(epic.id)!;
    expect(epicDetail.progress).toEqual({ total: 2, done: 1 });
  });

  // --- Timestamps ---

  it('getUpdatedAt works', () => {
    const task = tasks.create({ title: 'T', description: '' }, seedEmbedding(1));
    expect(tasks.getUpdatedAt(task.id)).toBe(task.updatedAt);
    expect(tasks.getUpdatedAt(999)).toBeNull();
  });
});
