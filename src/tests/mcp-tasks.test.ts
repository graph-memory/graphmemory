import { createTaskGraph } from '@/graphs/task-types';
import { createGraph } from '@/graphs/docs';
import { createCodeGraph } from '@/graphs/code';
import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import {
  setupMcpClient, createFakeEmbed, unitVec, json,
  type McpTestContext,
} from '@/tests/helpers';
import type { TaskStatus, TaskPriority } from '@/graphs/task-types';

// ---------------------------------------------------------------------------
// Types for result parsing
// ---------------------------------------------------------------------------

type CreateResult = { taskId: string };
type UpdateResult = { taskId: string; updated: boolean };
type DeleteResult = { taskId: string; deleted: boolean };
type MoveResult = { taskId: string; status: TaskStatus; completedAt: number | null };
type LinkResult = { fromId: string; toId: string; kind: string; created: boolean };
type CrossLinkResult = { taskId: string; targetId: string; targetGraph: string; kind: string; created: boolean };
type CrossDeleteResult = { taskId: string; targetId: string; targetGraph: string; deleted: boolean };

interface TaskResult {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: number | null;
  estimate: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  subtasks: Array<{ id: string; title: string; status: TaskStatus }>;
  blockedBy: Array<{ id: string; title: string }>;
  blocks: Array<{ id: string; title: string }>;
  related: Array<{ id: string; title: string }>;
}

interface TaskListEntry {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
}

interface TaskSearchHit {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  score: number;
}

type LinkedTaskResult = { taskId: string; title: string; kind: string; status: TaskStatus; priority: TaskPriority; tags: string[] };

// ---------------------------------------------------------------------------
// CRUD tests
// ---------------------------------------------------------------------------

describe('Task CRUD tools', () => {
  const taskGraph = createTaskGraph();
  const fakeEmbed = createFakeEmbed([
    ['fix auth', 20],
    ['add search', 21],
    ['refactor config', 22],
  ]);
  let ctx: McpTestContext;
  let call: McpTestContext['call'];

  beforeAll(async () => {
    ctx = await setupMcpClient({ taskGraph, embedFn: fakeEmbed });
    call = ctx.call;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // -- tasks_create --

  it('create_task returns taskId', async () => {
    const res = json<CreateResult>(await call('tasks_create', {
      title: 'Fix Auth Redirect',
      description: 'The login redirect is broken.',
      priority: 'high',
      tags: ['bug', 'auth'],
    }));
    expect(res.taskId).toBe('fix-auth-redirect');
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
    expect(res.taskId).toBe('add-search-feature');
  });

  it('create_task defaults to backlog', async () => {
    const res = json<CreateResult>(await call('tasks_create', {
      title: 'Refactor Config',
      description: 'Clean up config loading.',
      priority: 'low',
    }));
    expect(res.taskId).toBe('refactor-config');
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'refactor-config' }));
    expect(task.status).toBe('backlog');
  });

  // -- tasks_get --

  it('get_task returns full task', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'fix-auth-redirect' }));
    expect(task.title).toBe('Fix Auth Redirect');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('high');
    expect(task.tags).toEqual(['bug', 'auth']);
    expect(task.subtasks).toHaveLength(0);
  });

  it('get_task returns error for missing', async () => {
    const res = await call('tasks_get', { taskId: 'nonexistent' });
    expect(res.isError).toBe(true);
  });

  // -- tasks_update --

  it('update_task changes description', async () => {
    const res = json<UpdateResult>(await call('tasks_update', {
      taskId: 'fix-auth-redirect',
      description: 'Updated: redirect loop on OAuth callback.',
    }));
    expect(res.updated).toBe(true);
  });

  it('update_task verifies change', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'fix-auth-redirect' }));
    expect(task.description).toContain('OAuth callback');
  });

  it('update_task status to done sets completedAt', async () => {
    await call('tasks_update', { taskId: 'fix-auth-redirect', status: 'done' });
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'fix-auth-redirect' }));
    expect(task.status).toBe('done');
    expect(task.completedAt).toBeGreaterThan(0);
  });

  it('update_task reopen clears completedAt', async () => {
    await call('tasks_update', { taskId: 'fix-auth-redirect', status: 'todo' });
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'fix-auth-redirect' }));
    expect(task.status).toBe('todo');
    expect(task.completedAt).toBeNull();
  });

  // -- tasks_move --

  it('move_task changes status', async () => {
    const res = json<MoveResult>(await call('tasks_move', {
      taskId: 'add-search-feature',
      status: 'in_progress',
    }));
    expect(res.status).toBe('in_progress');
    expect(res.completedAt).toBeNull();
  });

  it('move_task to done sets completedAt', async () => {
    const res = json<MoveResult>(await call('tasks_move', {
      taskId: 'add-search-feature',
      status: 'done',
    }));
    expect(res.status).toBe('done');
    expect(res.completedAt).toBeGreaterThan(0);
  });

  it('move_task reopen clears completedAt', async () => {
    const res = json<MoveResult>(await call('tasks_move', {
      taskId: 'add-search-feature',
      status: 'todo',
    }));
    expect(res.completedAt).toBeNull();
  });

  // -- tasks_list --

  it('list_tasks returns all 3', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list'));
    expect(tasks).toHaveLength(3);
  });

  it('list_tasks sorted by priority', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list'));
    expect(tasks[0].priority).toBe('high');
  });

  it('list_tasks filter by status', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list', { status: 'todo' }));
    expect(tasks).toHaveLength(2);
  });

  it('list_tasks filter by priority', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list', { priority: 'high' }));
    expect(tasks).toHaveLength(1);
  });

  it('list_tasks filter by tag', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list', { tag: 'bug' }));
    expect(tasks).toHaveLength(1);
  });

  it('list_tasks substring filter', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list', { filter: 'auth' }));
    expect(tasks).toHaveLength(1);
  });

  it('list_tasks limit', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list', { limit: 1 }));
    expect(tasks).toHaveLength(1);
  });

  // -- tasks_search --

  it('search_tasks finds by query (vector mode)', async () => {
    const hits = json<TaskSearchHit[]>(await call('tasks_search', {
      query: 'fix auth redirect',
      minScore: 0.5,
      searchMode: 'vector',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('fix-auth-redirect');
    expect(hits[0].score).toBeGreaterThan(0.5);
  });

  it('search_tasks finds by query (keyword mode)', async () => {
    const hits = json<TaskSearchHit[]>(await call('tasks_search', {
      query: 'OAuth callback redirect',
      minScore: 0,
      searchMode: 'keyword',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('fix-auth-redirect');
  });

  // -- tasks_link --

  it('link_task creates subtask_of', async () => {
    const res = json<LinkResult>(await call('tasks_link', {
      fromId: 'refactor-config',
      toId: 'fix-auth-redirect',
      kind: 'subtask_of',
    }));
    expect(res.created).toBe(true);
  });

  it('link_task creates blocks', async () => {
    const res = json<LinkResult>(await call('tasks_link', {
      fromId: 'fix-auth-redirect',
      toId: 'add-search-feature',
      kind: 'blocks',
    }));
    expect(res.created).toBe(true);
  });

  it('get_task shows subtasks and blocks', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'fix-auth-redirect' }));
    expect(task.subtasks).toHaveLength(1);
    expect(task.subtasks[0].id).toBe('refactor-config');
    expect(task.blocks).toHaveLength(1);
    expect(task.blocks[0].id).toBe('add-search-feature');
  });

  it('get_task shows blockedBy', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: 'add-search-feature' }));
    expect(task.blockedBy).toHaveLength(1);
    expect(task.blockedBy[0].id).toBe('fix-auth-redirect');
  });

  it('link_task duplicate returns error', async () => {
    const res = await call('tasks_link', {
      fromId: 'refactor-config',
      toId: 'fix-auth-redirect',
      kind: 'subtask_of',
    });
    expect(res.isError).toBe(true);
  });

  // -- tasks_delete --

  it('delete_task removes task', async () => {
    const res = json<DeleteResult>(await call('tasks_delete', { taskId: 'refactor-config' }));
    expect(res.deleted).toBe(true);
  });

  it('deleted task no longer returned', async () => {
    const res = await call('tasks_get', { taskId: 'refactor-config' });
    expect(res.isError).toBe(true);
  });

  it('list_tasks after delete returns 2', async () => {
    const tasks = json<TaskListEntry[]>(await call('tasks_list'));
    expect(tasks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph link tests
// ---------------------------------------------------------------------------

describe('Task cross-graph links', () => {
  const tDocGraph = createGraph();
  const tCodeGraph = createCodeGraph();
  const tKnowledgeGraph = createKnowledgeGraph();
  const tTaskGraph = createTaskGraph();
  const tFakeEmbed = createFakeEmbed([['task', 10]]);
  let tCtx: McpTestContext;
  let tCall: McpTestContext['call'];

  beforeAll(async () => {
    // Add doc node
    tDocGraph.addNode('api.md::Auth', {
      title: 'Auth',
      content: 'Auth section',
      fileId: 'api.md',
      level: 2,
      embedding: unitVec(0),
      fileEmbedding: [],
      mtime: 1000,
      symbols: [],
    });

    // Add code node
    tCodeGraph.addNode('src/auth.ts::login', {
      kind: 'function' as const,
      name: 'login',
      fileId: 'src/auth.ts',
      signature: 'function login()',
      docComment: '',
      body: 'function login() {}',
      startLine: 1,
      endLine: 3,
      isExported: true,
      embedding: unitVec(1),
      fileEmbedding: [],
      mtime: 1000,
    });

    tCtx = await setupMcpClient({
      docGraph: tDocGraph,
      codeGraph: tCodeGraph,
      knowledgeGraph: tKnowledgeGraph,
      taskGraph: tTaskGraph,
      embedFn: tFakeEmbed,
    });
    tCall = tCtx.call;

    // Create tasks
    await tCall('tasks_create', { title: 'Task A', description: 'First task', priority: 'high', tags: ['a'] });
    await tCall('tasks_create', { title: 'Task B', description: 'Second task', priority: 'medium', tags: ['b'] });
  });

  afterAll(async () => {
    await tCtx.close();
  });

  it('create_task_link to docs', async () => {
    const res = json<CrossLinkResult>(await tCall('tasks_create_link', {
      taskId: 'task-a',
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
  });

  it('create_task_link to code', async () => {
    const res = json<CrossLinkResult>(await tCall('tasks_create_link', {
      taskId: 'task-a',
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      kind: 'fixes',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
  });

  it('create_task_link duplicate returns error', async () => {
    const res = await tCall('tasks_create_link', {
      taskId: 'task-a',
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('create_task_link invalid target returns error', async () => {
    const res = await tCall('tasks_create_link', {
      taskId: 'task-a',
      targetId: 'nonexistent.md::Foo',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('find_linked_tasks finds task linked to doc', async () => {
    const results = json<LinkedTaskResult[]>(await tCall('tasks_find_linked', {
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('task-a');
    expect(results[0].kind).toBe('references');
  });

  it('find_linked_tasks finds task linked to code', async () => {
    const results = json<LinkedTaskResult[]>(await tCall('tasks_find_linked', {
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe('task-a');
    expect(results[0].kind).toBe('fixes');
  });

  it('find_linked_tasks returns message for unlinked', async () => {
    const res = await tCall('tasks_find_linked', {
      targetId: 'nonexistent.md::Foo',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBeUndefined();
    const text = res.content[0].text!;
    expect(text).toContain('No tasks linked');
  });

  it('find_linked_tasks filters by kind', async () => {
    // task-a has a 'fixes' link to code, check that filtering by 'references' returns no results
    const res = await tCall('tasks_find_linked', {
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      kind: 'references', // task-a linked with 'fixes', not 'references'
      projectId: 'test',
    });
    const text = res.content[0].text!;
    expect(text).toContain('No tasks linked');
  });

  it('delete_task_link removes cross-graph link', async () => {
    const res = json<CrossDeleteResult>(await tCall('tasks_delete_link', {
      taskId: 'task-a',
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      projectId: 'test',
    }));
    expect(res.deleted).toBe(true);
  });

  it('after delete_task_link, find_linked_tasks returns empty', async () => {
    const res = await tCall('tasks_find_linked', {
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      projectId: 'test',
    });
    const text = res.content[0].text!;
    expect(text).toContain('No tasks linked');
  });

  it('delete_task cleans up remaining cross-graph proxy', async () => {
    // task-a still has a link to code node
    const del = json<{ taskId: string; deleted: boolean }>(await tCall('tasks_delete', { taskId: 'task-a' }));
    expect(del.deleted).toBe(true);
    // Proxy for code link should be cleaned up
    expect(tTaskGraph.hasNode('@code::src/auth.ts::login')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Knowledge → Task cross-graph links
// ---------------------------------------------------------------------------

describe('Knowledge to Task cross-graph links', () => {
  const kTaskGraph = createTaskGraph();
  const kKnowledgeGraph = createKnowledgeGraph();
  const kFakeEmbed = createFakeEmbed([['task', 10], ['note', 11]]);
  let kCtx: McpTestContext;
  let kCall: McpTestContext['call'];

  beforeAll(async () => {
    kCtx = await setupMcpClient({
      knowledgeGraph: kKnowledgeGraph,
      taskGraph: kTaskGraph,
      embedFn: kFakeEmbed,
    });
    kCall = kCtx.call;

    // Create a task and a note
    await kCall('tasks_create', { title: 'My Task', description: 'A task', priority: 'high' });
    await kCall('notes_create', { title: 'My Note', content: 'A note about the task' });
  });

  afterAll(async () => {
    await kCtx.close();
  });

  it('note can link to task via create_relation with targetGraph=tasks', async () => {
    const res = await kCall('notes_create_link', {
      fromId: 'my-note',
      toId: 'my-task',
      kind: 'tracks',
      targetGraph: 'tasks',
      projectId: 'test',
    });
    expect(res.isError).toBeUndefined();
    const data = json<{ created: boolean }>(res);
    expect(data.created).toBe(true);
  });

  it('find_linked_notes with targetGraph=tasks finds the note', async () => {
    const results = json<Array<{ noteId: string; kind: string }>>(await kCall('notes_find_linked', {
      targetId: 'my-task',
      targetGraph: 'tasks',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe('my-note');
    expect(results[0].kind).toBe('tracks');
  });

  it('delete_relation with targetGraph=tasks removes link', async () => {
    const res = await kCall('notes_delete_link', {
      fromId: 'my-note',
      toId: 'my-task',
      targetGraph: 'tasks',
      projectId: 'test',
    });
    expect(res.isError).toBeUndefined();
    const data = json<{ deleted: boolean }>(res);
    expect(data.deleted).toBe(true);
  });

  it('proxy cleaned up after delete', async () => {
    expect(kKnowledgeGraph.hasNode('@tasks::my-task')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph proxy cleanup on delete
// ---------------------------------------------------------------------------

describe('Cross-graph proxy cleanup on entity deletion', () => {
  const cgTaskGraph = createTaskGraph();
  const cgKnowledgeGraph = createKnowledgeGraph();
  const cgFakeEmbed = createFakeEmbed([['task', 10], ['note', 11]]);
  let cgCtx: McpTestContext;
  let cgCall: McpTestContext['call'];

  beforeAll(async () => {
    cgCtx = await setupMcpClient({
      knowledgeGraph: cgKnowledgeGraph,
      taskGraph: cgTaskGraph,
      embedFn: cgFakeEmbed,
    });
    cgCall = cgCtx.call;
  });

  afterAll(async () => {
    await cgCtx.close();
  });

  it('delete_note cleans up proxy in TaskGraph', async () => {
    // Create note and task, link task → knowledge note
    await cgCall('notes_create', { title: 'Linked Note', content: 'A note', tags: [] });
    await cgCall('tasks_create', { title: 'Linked Task', description: 'A task', priority: 'high' });
    await cgCall('tasks_create_link', {
      taskId: 'linked-task',
      targetId: 'linked-note',
      targetGraph: 'knowledge',
      kind: 'references',
      projectId: 'test',
    });

    // Verify proxy exists in TaskGraph (project-scoped proxy ID)
    expect(cgTaskGraph.hasNode('@knowledge::test::linked-note')).toBe(true);

    // Delete the note
    await cgCall('notes_delete', { noteId: 'linked-note' });

    // Proxy in TaskGraph should be cleaned up
    expect(cgTaskGraph.hasNode('@knowledge::test::linked-note')).toBe(false);
  });

  it('delete_task cleans up proxy in KnowledgeGraph', async () => {
    // Create note and task, link note → task
    await cgCall('notes_create', { title: 'Another Note', content: 'A note', tags: [] });
    await cgCall('tasks_create', { title: 'Another Task', description: 'A task', priority: 'high' });
    await cgCall('notes_create_link', {
      fromId: 'another-note',
      toId: 'another-task',
      kind: 'tracks',
      targetGraph: 'tasks',
      projectId: 'test',
    });

    // Verify proxy exists in KnowledgeGraph (project-scoped proxy ID)
    expect(cgKnowledgeGraph.hasNode('@tasks::test::another-task')).toBe(true);

    // Delete the task
    await cgCall('tasks_delete', { taskId: 'another-task' });

    // Proxy in KnowledgeGraph should be cleaned up
    expect(cgKnowledgeGraph.hasNode('@tasks::test::another-task')).toBe(false);
  });
});
