import { createSqliteStoreFactory, seedEmbedding, TEST_DIM } from '../helpers';
import type { SqliteStore } from '@/store';

describe('Epics link/unlink tasks', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'epic-link', name: 'Epic Link', directory: '/tmp/epic' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  it('links a task to an epic', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    const task = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);

    scoped.epics.linkTask(epic.id, task.id);

    const tasks = scoped.epics.listTasks(epic.id);
    expect(tasks).toContain(task.id);
  });

  it('unlinks a task from an epic', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    const task = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);

    scoped.epics.linkTask(epic.id, task.id);
    scoped.epics.unlinkTask(epic.id, task.id);

    expect(scoped.epics.listTasks(epic.id)).toHaveLength(0);
  });

  it('linking same task twice is idempotent (INSERT OR IGNORE)', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    const task = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);

    scoped.epics.linkTask(epic.id, task.id);
    scoped.epics.linkTask(epic.id, task.id); // duplicate — should not throw

    expect(scoped.epics.listTasks(epic.id)).toHaveLength(1);
  });

  it('unlinking non-linked task is no-op', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    // No task linked — should not throw
    scoped.epics.unlinkTask(epic.id, 99999);
  });

  it('throws when linking to non-existent epic', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const task = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);

    expect(() => scoped.epics.linkTask(99999, task.id)).toThrow(/not found/i);
  });

  it('throws when linking non-existent task', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);
    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);

    expect(() => scoped.epics.linkTask(epic.id, 99999)).toThrow(/not found/i);
  });

  it('multiple tasks can be linked to one epic', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    const t1 = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);
    const t2 = scoped.tasks.create({ title: 'Task 2', description: '' }, emb);
    const t3 = scoped.tasks.create({ title: 'Task 3', description: '' }, emb);

    scoped.epics.linkTask(epic.id, t1.id);
    scoped.epics.linkTask(epic.id, t2.id);
    scoped.epics.linkTask(epic.id, t3.id);

    const tasks = scoped.epics.listTasks(epic.id);
    expect(tasks).toHaveLength(3);
    expect(tasks).toContain(t1.id);
    expect(tasks).toContain(t2.id);
    expect(tasks).toContain(t3.id);
  });

  it('epic progress reflects linked tasks', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    const t1 = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);
    const t2 = scoped.tasks.create({ title: 'Task 2', description: '' }, emb);

    scoped.epics.linkTask(epic.id, t1.id);
    scoped.epics.linkTask(epic.id, t2.id);

    // Move one to done
    scoped.tasks.move(t1.id, 'done');

    const fetched = scoped.epics.get(epic.id)!;
    expect(fetched.progress.total).toBe(2);
    expect(fetched.progress.done).toBe(1);
  });

  it('cancelled tasks excluded from progress total', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    const epic = scoped.epics.create({ title: 'Epic 1', description: '' }, emb);
    const t1 = scoped.tasks.create({ title: 'Task 1', description: '' }, emb);
    const t2 = scoped.tasks.create({ title: 'Task 2', description: '' }, emb);

    scoped.epics.linkTask(epic.id, t1.id);
    scoped.epics.linkTask(epic.id, t2.id);

    scoped.tasks.move(t2.id, 'cancelled');

    const fetched = scoped.epics.get(epic.id)!;
    // Cancelled tasks excluded from total
    expect(fetched.progress.total).toBe(1);
    expect(fetched.progress.done).toBe(0);
  });
});

describe('Embedding dimension validation', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'dim-test', name: 'Dim Test', directory: '/tmp/dim' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  it('rejects embedding with wrong dimension for knowledge', () => {
    const scoped = store.project(projectId);
    const wrongDim = new Array(64).fill(0.1); // Wrong dimension (should be TEST_DIM=384)

    expect(() => scoped.knowledge.create({ title: 'x', content: 'c' }, wrongDim)).toThrow(/embedding/i);
  });

  it('rejects embedding with wrong dimension for tasks', () => {
    const scoped = store.project(projectId);
    const wrongDim = new Array(64).fill(0.1);

    expect(() => scoped.tasks.create({ title: 'x', description: '' }, wrongDim)).toThrow(/embedding/i);
  });

  it('rejects embedding with wrong dimension for skills', () => {
    const scoped = store.project(projectId);
    const wrongDim = new Array(64).fill(0.1);

    expect(() => scoped.skills.create({ title: 'x', description: '' }, wrongDim)).toThrow(/embedding/i);
  });

  it('rejects embedding with wrong dimension for epics', () => {
    const scoped = store.project(projectId);
    const wrongDim = new Array(64).fill(0.1);

    expect(() => scoped.epics.create({ title: 'x', description: '' }, wrongDim)).toThrow(/embedding/i);
  });

  it('rejects empty embedding', () => {
    const scoped = store.project(projectId);
    expect(() => scoped.knowledge.create({ title: 'x', content: 'c' }, [])).toThrow(/embedding/i);
  });
});
