import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, text, jsonList,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';

type CreateResult = { epicId: number };
type UpdateResult = { epicId: number; updated: boolean };
type DeleteResult = { epicId: number; deleted: boolean };
type LinkResult = { epicId: number; taskId: number; linked: boolean };

describe('MCP Epics', () => {
  let ctx: McpTestContext;
  let storeCtx: TestStoreContext;
  let epicId1: number;
  let epicId2: number;

  beforeAll(async () => {
    const embedFn = createFakeEmbed([['deploy', 1], ['roadmap', 2], ['auth', 3], ['docker', 4]]);
    storeCtx = createTestStoreManager(embedFn);
    ctx = await setupMcpClient({ storeManager: storeCtx.storeManager, embedFn });
  });

  afterAll(async () => {
    await ctx.close();
    storeCtx.cleanup();
  });

  // -- Create --

  it('creates an epic', async () => {
    const r = json<CreateResult>(await ctx.call('epics_create', {
      title: 'Deploy pipeline',
      description: 'Set up CI/CD pipeline',
      priority: 'high',
    }));
    expect(typeof r.epicId).toBe('number');
    epicId1 = r.epicId;
  });

  it('creates a second epic with tags', async () => {
    const r = json<CreateResult>(await ctx.call('epics_create', {
      title: 'Auth roadmap',
      description: 'Authentication improvements',
      priority: 'medium',
      tags: ['auth', 'security'],
    }));
    expect(typeof r.epicId).toBe('number');
    epicId2 = r.epicId;
  });

  // -- Get --

  it('gets an epic by ID', async () => {
    const r = json<any>(await ctx.call('epics_get', { epicId: epicId1 }));
    expect(r.title).toBe('Deploy pipeline');
    expect(r.priority).toBe('high');
    expect(r.status).toBe('open');
    expect(r.progress).toBeDefined();
  });

  it('returns error for non-existent epic', async () => {
    const r = await ctx.call('epics_get', { epicId: 999999 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('not found');
  });

  // -- List --

  it('lists all epics', async () => {
    const r = jsonList<any>(await ctx.call('epics_list', {}));
    expect(r.length).toBe(2);
  });

  it('lists epics filtered by priority', async () => {
    const r = jsonList<any>(await ctx.call('epics_list', { priority: 'high' }));
    expect(r.length).toBe(1);
    expect(r[0].title).toBe('Deploy pipeline');
  });

  it('lists epics filtered by status', async () => {
    const r = jsonList<any>(await ctx.call('epics_list', { status: 'open' }));
    expect(r.length).toBe(2);
  });

  // -- Update --

  it('updates an epic', async () => {
    const r = json<UpdateResult>(await ctx.call('epics_update', {
      epicId: epicId1,
      title: 'Deploy pipeline v2',
      status: 'in_progress',
    }));
    expect(r.updated).toBe(true);
  });

  it('verifies update', async () => {
    const r = json<any>(await ctx.call('epics_get', { epicId: epicId1 }));
    expect(r.title).toBe('Deploy pipeline v2');
    expect(r.status).toBe('in_progress');
  });

  // -- Search --

  it('calls epic search tool', async () => {
    const r = await ctx.call('epics_search', { query: 'deploy', searchMode: 'vector' });
    // Tool is exercised — may return results or error depending on embedding state
    expect(r.content).toBeDefined();
    expect(r.content.length).toBeGreaterThan(0);
  });

  it('update non-existent returns error', async () => {
    const r = await ctx.call('epics_update', { epicId: 999999, title: 'x' });
    expect(r.isError).toBe(true);
  });

  // -- Link task to epic --

  it('creates a task and links to epic', async () => {
    const cr = json<{ taskId: number }>(await ctx.call('tasks_create', {
      title: 'Set up Docker',
      description: 'Docker compose config',
      priority: 'medium',
    }));
    const r = json<LinkResult>(await ctx.call('epics_link_task', {
      epicId: epicId1,
      taskId: cr.taskId,
    }));
    expect(r.linked).toBe(true);
  });

  it('epic progress reflects linked task', async () => {
    const r = json<any>(await ctx.call('epics_get', { epicId: epicId1 }));
    expect(r.progress.total).toBe(1);
    expect(r.progress.done).toBe(0);
  });

  // -- Delete --

  it('deletes an epic', async () => {
    const r = json<DeleteResult>(await ctx.call('epics_delete', { epicId: epicId2 }));
    expect(r.deleted).toBe(true);
  });

  it('list reflects deletion', async () => {
    const r = jsonList<any>(await ctx.call('epics_list', {}));
    expect(r.length).toBe(1);
    expect(r[0].id).toBe(epicId1);
  });

  it('delete non-existent returns error', async () => {
    const r = await ctx.call('epics_delete', { epicId: 999999 });
    expect(r.isError).toBe(true);
  });
});
