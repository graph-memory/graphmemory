import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, jsonList, text,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Types for result parsing
// ---------------------------------------------------------------------------

type CreateResult = { taskId: number };
type UpdateResult = { taskId: number; updated: boolean };
type DeleteResult = { taskId: number; deleted: boolean };
type MoveResult = { taskId: number; status: string; completedAt: number | null };
type LinkResult = { fromId: number; toId: number; kind: string; created: boolean };

interface TaskResult {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  subtasks: Array<{ id: number; title: string; status: string }>;
  blockedBy: Array<{ id: number; title: string; status: string }>;
  blocks: Array<{ id: number; title: string; status: string }>;
  related: Array<{ id: number; title: string; status: string }>;
}

interface TaskListEntry {
  id: number;
  title: string;
  status: string;
  priority: string;
  tags: string[];
}

interface TaskSearchHit {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  score: number;
}


// ---------------------------------------------------------------------------
// CRUD tests
// ---------------------------------------------------------------------------

describe('Task CRUD tools', () => {
  let storeCtx: TestStoreContext;
  let ctx: McpTestContext;
  let call: McpTestContext['call'];

  // Captured IDs from creation
  let fixAuthId: number;
  let addSearchId: number;
  let refactorConfigId: number;

  beforeAll(async () => {
    const fakeEmbed = createFakeEmbed([
      ['fix auth', 20],
      ['add search', 21],
      ['refactor config', 22],
    ]);
    storeCtx = createTestStoreManager(fakeEmbed);
    ctx = await setupMcpClient({ storeManager: storeCtx.storeManager, embedFn: fakeEmbed });
    call = ctx.call;
  });

  afterAll(async () => {
    await ctx.close();
    storeCtx.cleanup();
  });

  // -- tasks_create --

  it('create_task returns taskId', async () => {
    const res = json<CreateResult>(await call('tasks_create', {
      title: 'Fix Auth Redirect',
      description: 'The login redirect is broken.',
      priority: 'high',
      tags: ['bug', 'auth'],
    }));
    expect(typeof res.taskId).toBe('number');
    fixAuthId = res.taskId;
  });

  it('create_task with all optional fields', async () => {
    const res = json<CreateResult>(await call('tasks_create', {
      title: 'Add Search Feature',
      description: 'Implement full-text search.',
      priority: 'medium',
      status: 'todo',
      tags: ['feature'],
      dueDate: 1700000000000,
      estimate: 8,
    }));
    expect(typeof res.taskId).toBe('number');
    addSearchId = res.taskId;
  });

  it('create_task defaults to backlog', async () => {
    const res = json<CreateResult>(await call('tasks_create', {
      title: 'Refactor Config',
      description: 'Clean up config loading.',
      priority: 'low',
    }));
    expect(typeof res.taskId).toBe('number');
    refactorConfigId = res.taskId;
    const task = json<TaskResult>(await call('tasks_get', { taskId: refactorConfigId }));
    expect(task.status).toBe('backlog');
  });

  // -- tasks_get --

  it('get_task returns full task', async () => {
    const task = json<any>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.title).toBe('Fix Auth Redirect');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('high');
    expect(task.tags.sort()).toEqual(['auth', 'bug']);
  });

  it('get_task returns error for missing', async () => {
    const res = await call('tasks_get', { taskId: 999999 });
    expect(res.isError).toBe(true);
  });

  // -- tasks_update --

  it('update_task changes description', async () => {
    const res = json<UpdateResult>(await call('tasks_update', {
      taskId: fixAuthId,
      description: 'Updated: redirect loop on OAuth callback.',
    }));
    expect(res.updated).toBe(true);
  });

  it('update_task verifies change', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.description).toContain('OAuth callback');
  });

  it('update_task status to done via move sets completedAt', async () => {
    // tasks_move auto-manages completedAt; tasks_update does not
    await call('tasks_move', { taskId: fixAuthId, status: 'done' });
    const task = json<any>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.status).toBe('done');
    expect(task.completedAt).toBeGreaterThan(0);
  });

  it('move reopen clears completedAt', async () => {
    await call('tasks_move', { taskId: fixAuthId, status: 'todo' });
    const task = json<any>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.status).toBe('todo');
    expect(task.completedAt).toBeUndefined();
  });

  // -- tasks_move --

  it('move_task changes status', async () => {
    const res = json<MoveResult>(await call('tasks_move', {
      taskId: addSearchId,
      status: 'in_progress',
    }));
    expect(res.status).toBe('in_progress');
    expect(res.completedAt).toBeUndefined();
  });

  it('move_task to done sets completedAt', async () => {
    const res = json<MoveResult>(await call('tasks_move', {
      taskId: addSearchId,
      status: 'done',
    }));
    expect(res.status).toBe('done');
    expect(res.completedAt).toBeGreaterThan(0);
  });

  it('move_task reopen clears completedAt', async () => {
    const res = json<MoveResult>(await call('tasks_move', {
      taskId: addSearchId,
      status: 'todo',
    }));
    expect(res.completedAt).toBeUndefined();
  });

  // -- tasks_reorder --

  it('reorder_task changes order within same status', async () => {
    const res = json<{ taskId: number; status: string; order: number }>(await call('tasks_reorder', {
      taskId: fixAuthId,
      order: 500,
    }));
    expect(res.taskId).toBe(fixAuthId);
    expect(res.order).toBe(500);
  });

  it('reorder_task moves to different status', async () => {
    const res = json<{ taskId: number; status: string; order: number }>(await call('tasks_reorder', {
      taskId: refactorConfigId,
      order: 0,
      status: 'review',
    }));
    expect(res.taskId).toBe(refactorConfigId);
    expect(res.status).toBe('review');
    expect(res.order).toBe(0);
  });

  it('reorder_task returns error for missing task', async () => {
    const result = await call('tasks_reorder', { taskId: 999999, order: 0 });
    expect(result.isError).toBe(true);
  });

  // -- tasks_list --

  it('list_tasks returns all 3', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list'));
    expect(tasks).toHaveLength(3);
  });

  it('list_tasks includes high priority task', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list'));
    expect(tasks.some(t => t.priority === 'high')).toBe(true);
  });

  it('list_tasks filter by status', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list', { status: 'todo' }));
    expect(tasks).toHaveLength(2);
  });

  it('list_tasks filter by priority', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list', { priority: 'high' }));
    expect(tasks).toHaveLength(1);
  });

  it('list_tasks filter by tag', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list', { tag: 'bug' }));
    expect(tasks).toHaveLength(1);
  });

  it('list_tasks substring filter', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list', { filter: 'auth' }));
    expect(tasks).toHaveLength(1);
  });

  it('list_tasks limit', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list', { limit: 1 }));
    expect(tasks).toHaveLength(1);
  });

  // -- tasks_search --

  it('search_tasks finds by query (vector mode)', async () => {
    const hits = json<TaskSearchHit[]>(await call('tasks_search', {
      query: 'fix auth redirect',
      searchMode: 'vector',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(fixAuthId);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('search_tasks finds by query (keyword mode)', async () => {
    const hits = json<TaskSearchHit[]>(await call('tasks_search', {
      query: 'OAuth callback redirect',
      minScore: 0,
      searchMode: 'keyword',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(fixAuthId);
  });

  // -- tasks_link --

  it('link_task creates subtask_of', async () => {
    const res = json<LinkResult>(await call('tasks_link', {
      fromId: refactorConfigId,
      toId: fixAuthId,
      kind: 'subtask_of',
    }));
    expect(res.created).toBe(true);
  });

  it('link_task creates blocks', async () => {
    const res = json<LinkResult>(await call('tasks_link', {
      fromId: fixAuthId,
      toId: addSearchId,
      kind: 'blocks',
    }));
    expect(res.created).toBe(true);
  });

  it('get_task shows structured link arrays', async () => {
    const task = json<any>(await call('tasks_get', { taskId: fixAuthId }));
    // tasks_get now returns structured arrays: subtasks, blockedBy, blocks, related
    expect(task.subtasks).toBeDefined();
    expect(task.subtasks.length).toBeGreaterThan(0);
    expect(task.blocks).toBeDefined();
    expect(task.blocks.length).toBeGreaterThan(0);
  });

  it('link_task duplicate is silently ignored', async () => {
    const res = json<LinkResult>(await call('tasks_link', {
      fromId: refactorConfigId,
      toId: fixAuthId,
      kind: 'subtask_of',
    }));
    // INSERT OR IGNORE — duplicate is silently accepted
    expect(res.created).toBe(true);
  });

  // -- tasks_delete --

  it('delete_task removes task', async () => {
    const res = json<DeleteResult>(await call('tasks_delete', { taskId: refactorConfigId }));
    expect(res.deleted).toBe(true);
  });

  it('deleted task no longer returned', async () => {
    const res = await call('tasks_get', { taskId: refactorConfigId });
    expect(res.isError).toBe(true);
  });

  it('list_tasks after delete returns 2', async () => {
    const tasks = jsonList<TaskListEntry>(await call('tasks_list'));
    expect(tasks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Knowledge → Task cross-graph links
// ---------------------------------------------------------------------------

describe('Knowledge to Task cross-graph links', () => {
  let kStoreCtx: TestStoreContext;
  let kCtx: McpTestContext;
  let kCall: McpTestContext['call'];
  let myTaskId: number;
  let myNoteId: number;

  beforeAll(async () => {
    const kFakeEmbed = createFakeEmbed([['task', 10], ['note', 11]]);
    kStoreCtx = createTestStoreManager(kFakeEmbed);
    kCtx = await setupMcpClient({ storeManager: kStoreCtx.storeManager, embedFn: kFakeEmbed });
    kCall = kCtx.call;

    // Create a task and a note
    const taskRes = json<{ taskId: number }>(await kCall('tasks_create', { title: 'My Task', description: 'A task', priority: 'high' }));
    myTaskId = taskRes.taskId;
    const noteRes = json<{ noteId: number }>(await kCall('notes_create', { title: 'My Note', content: 'A note about the task' }));
    myNoteId = noteRes.noteId;
  });

  afterAll(async () => {
    await kCtx.close();
    kStoreCtx.cleanup();
  });

  it('note can link to task via notes_create_link with targetGraph=tasks', async () => {
    const res = await kCall('notes_create_link', {
      fromId: myNoteId,
      toId: myTaskId,
      kind: 'tracks',
      targetGraph: 'tasks',
    });
    expect(res.isError).toBeUndefined();
    const data = json<{ created: boolean }>(res);
    expect(data.created).toBe(true);
  });

  it('notes_find_linked with targetGraph=tasks finds the note', async () => {
    const results = json<Array<{ noteId: number; kind: string }>>(await kCall('notes_find_linked', {
      targetId: myTaskId,
      targetGraph: 'tasks',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe(myNoteId);
    expect(results[0].kind).toBe('tracks');
  });

  it('notes_delete_link with targetGraph=tasks removes link', async () => {
    const res = await kCall('notes_delete_link', {
      fromId: myNoteId,
      toId: myTaskId,
      kind: 'tracks',
      targetGraph: 'tasks',
    });
    expect(res.isError).toBeUndefined();
    const data = json<{ deleted: boolean }>(res);
    expect(data.deleted).toBe(true);
  });

  it('after delete, notes_find_linked returns empty', async () => {
    const res = await kCall('notes_find_linked', {
      targetId: myTaskId,
      targetGraph: 'tasks',
    });
    const t = text(res);
    expect(t).toContain('No notes linked');
  });
});

// ---------------------------------------------------------------------------
// Same-graph task-to-task links via tasks_create_link / tasks_delete_link
// ---------------------------------------------------------------------------

describe('Same-graph task links via tasks_create_link/tasks_delete_link', () => {
  let sgStoreCtx: TestStoreContext;
  let sgCtx: McpTestContext;
  let sgCall: McpTestContext['call'];
  let parentTaskId: number;
  let childTaskId: number;

  beforeAll(async () => {
    const sgFakeEmbed = createFakeEmbed([['task', 10]]);
    sgStoreCtx = createTestStoreManager(sgFakeEmbed);
    sgCtx = await setupMcpClient({ storeManager: sgStoreCtx.storeManager, embedFn: sgFakeEmbed });
    sgCall = sgCtx.call;

    const p = json<CreateResult>(await sgCall('tasks_create', { title: 'Parent Task', description: 'parent', priority: 'high' }));
    parentTaskId = p.taskId;
    const c = json<CreateResult>(await sgCall('tasks_create', { title: 'Child Task', description: 'child', priority: 'medium' }));
    childTaskId = c.taskId;
  });

  afterAll(async () => {
    await sgCtx.close();
    sgStoreCtx.cleanup();
  });

  it('tasks_create_link without targetGraph creates same-graph link', async () => {
    const res = json<{ taskId: number; targetId: number; kind: string; created: boolean }>(
      await sgCall('tasks_create_link', {
        taskId: parentTaskId,
        targetId: childTaskId,
        kind: 'related_to',
      }),
    );
    expect(res.created).toBe(true);
    expect(res.taskId).toBe(parentTaskId);
    expect(res.targetId).toBe(childTaskId);
  });

  it('same-graph link appears in tasks_get related', async () => {
    const task = json<any>(await sgCall('tasks_get', { taskId: parentTaskId }));
    // tasks_get now returns structured arrays instead of raw edges
    expect(task.related).toBeDefined();
    expect(task.related).toContain(childTaskId);
  });

  it('tasks_delete_link without targetGraph removes same-graph link', async () => {
    const res = json<{ taskId: number; targetId: number; deleted: boolean }>(
      await sgCall('tasks_delete_link', {
        taskId: parentTaskId,
        targetId: childTaskId,
        kind: 'related_to',
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after deletion, link no longer appears in tasks_get related', async () => {
    const task = json<any>(await sgCall('tasks_get', { taskId: parentTaskId }));
    expect(task.related ?? []).not.toContain(childTaskId);
  });
});

// ---------------------------------------------------------------------------
// Epic MCP tools
// ---------------------------------------------------------------------------

describe('Epic CRUD tools', () => {
  let epicStoreCtx: TestStoreContext;
  let ctx: McpTestContext;
  let call: McpTestContext['call'];
  let epicId: number;
  let taskId: number;

  beforeAll(async () => {
    const fakeEmbed = createFakeEmbed([['auth overhaul', 30], ['payment', 31]]);
    epicStoreCtx = createTestStoreManager(fakeEmbed);
    ctx = await setupMcpClient({ storeManager: epicStoreCtx.storeManager, embedFn: fakeEmbed });
    call = ctx.call;
  });

  afterAll(async () => {
    await ctx.close();
    epicStoreCtx.cleanup();
  });

  it('epics_create returns epicId', async () => {
    const res = json<{ epicId: number }>(await call('epics_create', {
      title: 'Auth Overhaul',
      description: 'Rewrite the auth system',
      priority: 'high',
      tags: ['auth'],
    }));
    expect(typeof res.epicId).toBe('number');
    epicId = res.epicId;
  });

  it('epics_get returns epic with progress', async () => {
    const res = json<any>(await call('epics_get', { epicId }));
    expect(res.title).toBe('Auth Overhaul');
    expect(res.status).toBe('open');
    expect(res.progress).toEqual({ done: 0, total: 0 });
  });

  it('epics_list returns created epic', async () => {
    const res = jsonList<any>(await call('epics_list', {}));
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res.some((e: any) => e.id === epicId)).toBe(true);
  });

  it('epics_update changes title and status', async () => {
    const res = json<{ epicId: number; updated: boolean }>(await call('epics_update', {
      epicId,
      title: 'Auth Overhaul v2',
      status: 'in_progress',
    }));
    expect(res.updated).toBe(true);
    const get = json<any>(await call('epics_get', { epicId }));
    expect(get.title).toBe('Auth Overhaul v2');
    expect(get.status).toBe('in_progress');
  });

  it('create a task and link to epic', async () => {
    const task = json<{ taskId: number }>(await call('tasks_create', {
      title: 'Fix login redirect',
      description: 'Login redirect broken',
      priority: 'high',
    }));
    taskId = task.taskId;

    const link = json<{ linked: boolean }>(await call('epics_link_task', { taskId, epicId }));
    expect(link.linked).toBe(true);
  });

  it('epic progress reflects linked task', async () => {
    const epic = json<any>(await call('epics_get', { epicId }));
    expect(epic.progress.total).toBe(1);
    expect(epic.progress.done).toBe(0);
  });

  it('epics_unlink_task removes link', async () => {
    const res = json<{ unlinked: boolean }>(await call('epics_unlink_task', { taskId, epicId }));
    expect(res.unlinked).toBe(true);
    const epic = json<any>(await call('epics_get', { epicId }));
    expect(epic.progress.total).toBe(0);
  });

  it('epics_delete removes epic', async () => {
    const res = json<{ deleted: boolean }>(await call('epics_delete', { epicId }));
    expect(res.deleted).toBe(true);
    const get = await call('epics_get', { epicId });
    expect(get.isError).toBe(true);
  });

  it('tasks_list excludes epics', async () => {
    // Create an epic
    const ep = json<{ epicId: number }>(await call('epics_create', {
      title: 'Hidden Epic',
      description: '',
      priority: 'low',
    }));
    // List tasks should not include it
    const tasks = jsonList<any>(await call('tasks_list', {}));
    expect(tasks.every((t: any) => t.id !== ep.epicId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

describe('MCP bulk task operations', () => {
  let bulkStoreCtx: TestStoreContext;
  let call: McpTestContext['call'];
  let close: McpTestContext['close'];
  const ids: number[] = [];

  beforeAll(async () => {
    const embedFn = createFakeEmbed([['alpha', 1], ['beta', 2], ['gamma', 3]]);
    bulkStoreCtx = createTestStoreManager(embedFn);
    const ctx = await setupMcpClient({ storeManager: bulkStoreCtx.storeManager, embedFn });
    call = ctx.call;
    close = ctx.close;

    // Create 3 tasks
    for (const title of ['Alpha task', 'Beta task', 'Gamma task']) {
      const r = json<CreateResult>(await call('tasks_create', { title, description: 'desc', priority: 'medium' }));
      ids.push(r.taskId);
    }
  });

  afterAll(async () => {
    await close();
    bulkStoreCtx.cleanup();
  });

  it('bulk moves tasks to a new status', async () => {
    const r = json<{ moved: number }>(await call('tasks_bulk_move', { taskIds: ids, status: 'in_progress' }));
    expect(r.moved).toBe(3);
  });

  it('verifies tasks were moved', async () => {
    for (const id of ids) {
      const t = json<any>(await call('tasks_get', { taskId: id }));
      expect(t.status).toBe('in_progress');
    }
  });

  it('bulk moves with non-existent IDs — skips missing', async () => {
    const r = json<{ moved: number }>(await call('tasks_bulk_move', {
      taskIds: [ids[0], 999999],
      status: 'review',
    }));
    expect(r.moved).toBe(1);
  });

  it('bulk updates priority', async () => {
    const r = json<{ updated: number }>(await call('tasks_bulk_priority', { taskIds: ids, priority: 'high' }));
    expect(r.updated).toBe(3);
  });

  it('verifies priority was updated', async () => {
    for (const id of ids) {
      const t = json<any>(await call('tasks_get', { taskId: id }));
      expect(t.priority).toBe('high');
    }
  });

  it('bulk deletes tasks', async () => {
    const r = json<{ deleted: number }>(await call('tasks_bulk_delete', { taskIds: [ids[1], ids[2]] }));
    expect(r.deleted).toBe(2);
  });

  it('verifies deletion', async () => {
    const list = jsonList<any>(await call('tasks_list', {}));
    expect(list.find((t: any) => t.id === ids[1])).toBeUndefined();
    expect(list.find((t: any) => t.id === ids[2])).toBeUndefined();
    expect(list.find((t: any) => t.id === ids[0])).toBeDefined();
  });

  it('bulk delete with non-existent IDs — skips missing', async () => {
    const r = json<{ deleted: number }>(await call('tasks_bulk_delete', { taskIds: [999999] }));
    expect(r.deleted).toBe(0);
  });
});
