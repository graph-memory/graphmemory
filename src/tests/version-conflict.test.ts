import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, text,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';

describe('Optimistic locking — version conflicts', () => {
  let ctx: McpTestContext;
  let storeCtx: TestStoreContext;
  let noteId: number;
  let taskId: number;

  beforeAll(async () => {
    const embedFn = createFakeEmbed([['test', 1], ['conflict', 2]]);
    storeCtx = createTestStoreManager(embedFn);
    ctx = await setupMcpClient({ storeManager: storeCtx.storeManager, embedFn });

    // Create test entities
    noteId = json<{ noteId: number }>(await ctx.call('notes_create', {
      title: 'Conflict test note', content: 'original',
    })).noteId;

    taskId = json<{ taskId: number }>(await ctx.call('tasks_create', {
      title: 'Conflict test task', description: 'original', priority: 'medium',
    })).taskId;
  });

  afterAll(async () => {
    await ctx.close();
    storeCtx.cleanup();
  });

  // -- Notes --

  it('note update with correct version succeeds', async () => {
    const r = json<any>(await ctx.call('notes_update', {
      noteId, title: 'Updated', expectedVersion: 1,
    }));
    expect(r.updated).toBe(true);
  });

  it('note update with stale version returns error', async () => {
    const r = await ctx.call('notes_update', {
      noteId, title: 'Stale', expectedVersion: 1,
    });
    expect(r.isError).toBe(true);
    expect(text(r).toLowerCase()).toContain('version');
  });

  it('note update without version always succeeds', async () => {
    const r = json<any>(await ctx.call('notes_update', {
      noteId, title: 'No lock',
    }));
    expect(r.updated).toBe(true);
  });

  // -- Tasks --

  it('task update with correct version succeeds', async () => {
    const r = json<any>(await ctx.call('tasks_update', {
      taskId, title: 'Updated task', expectedVersion: 1,
    }));
    expect(r.updated).toBe(true);
  });

  it('task update with stale version returns error', async () => {
    const r = await ctx.call('tasks_update', {
      taskId, title: 'Stale', expectedVersion: 1,
    });
    expect(r.isError).toBe(true);
    expect(text(r).toLowerCase()).toContain('version');
  });

  it('task move with stale version returns error', async () => {
    const r = await ctx.call('tasks_move', {
      taskId, status: 'done', expectedVersion: 1,
    });
    expect(r.isError).toBe(true);
    expect(text(r).toLowerCase()).toContain('version');
  });

  it('task move with correct version succeeds', async () => {
    const r = json<any>(await ctx.call('tasks_move', {
      taskId, status: 'done', expectedVersion: 2,
    }));
    expect(typeof r.taskId).toBe('number');
  });
});
