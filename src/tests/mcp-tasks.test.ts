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

  // Captured IDs from creation
  let fixAuthId: string;
  let addSearchId: string;
  let refactorConfigId: string;

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
    expect(res.taskId).toMatch(/^[0-9a-f]{8}-/);
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
    expect(res.taskId).toMatch(/^[0-9a-f]{8}-/);
    addSearchId = res.taskId;
  });

  it('create_task defaults to backlog', async () => {
    const res = json<CreateResult>(await call('tasks_create', {
      title: 'Refactor Config',
      description: 'Clean up config loading.',
      priority: 'low',
    }));
    expect(res.taskId).toMatch(/^[0-9a-f]{8}-/);
    refactorConfigId = res.taskId;
    const task = json<TaskResult>(await call('tasks_get', { taskId: refactorConfigId }));
    expect(task.status).toBe('backlog');
  });

  // -- tasks_get --

  it('get_task returns full task', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.title).toBe('Fix Auth Redirect');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('high');
    expect(task.tags).toEqual(['bug', 'auth']);
    expect(task.subtasks).toBeUndefined();
  });

  it('get_task returns error for missing', async () => {
    const res = await call('tasks_get', { taskId: 'nonexistent' });
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

  it('update_task status to done sets completedAt', async () => {
    await call('tasks_update', { taskId: fixAuthId, status: 'done' });
    const task = json<TaskResult>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.status).toBe('done');
    expect(task.completedAt).toBeGreaterThan(0);
  });

  it('update_task reopen clears completedAt', async () => {
    await call('tasks_update', { taskId: fixAuthId, status: 'todo' });
    const task = json<TaskResult>(await call('tasks_get', { taskId: fixAuthId }));
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
    const res = json<{ taskId: string; status: string; order: number }>(await call('tasks_reorder', {
      taskId: fixAuthId,
      order: 500,
    }));
    expect(res.taskId).toBe(fixAuthId);
    expect(res.order).toBe(500);
  });

  it('reorder_task moves to different status', async () => {
    const res = json<{ taskId: string; status: string; order: number }>(await call('tasks_reorder', {
      taskId: refactorConfigId,
      order: 0,
      status: 'review',
    }));
    expect(res.taskId).toBe(refactorConfigId);
    expect(res.status).toBe('review');
    expect(res.order).toBe(0);
  });

  it('reorder_task returns error for missing task', async () => {
    const result = await call('tasks_reorder', { taskId: 'nonexistent', order: 0 });
    expect(result.isError).toBe(true);
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
    expect(hits[0].id).toBe(fixAuthId);
    expect(hits[0].score).toBeGreaterThan(0.5);
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

  it('get_task shows subtasks and blocks', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: fixAuthId }));
    expect(task.subtasks).toHaveLength(1);
    expect(task.subtasks[0].id).toBe(refactorConfigId);
    expect(task.blocks).toHaveLength(1);
    expect(task.blocks[0].id).toBe(addSearchId);
  });

  it('get_task shows blockedBy', async () => {
    const task = json<TaskResult>(await call('tasks_get', { taskId: addSearchId }));
    expect(task.blockedBy).toHaveLength(1);
    expect(task.blockedBy[0].id).toBe(fixAuthId);
  });

  it('link_task duplicate returns error', async () => {
    const res = await call('tasks_link', {
      fromId: refactorConfigId,
      toId: fixAuthId,
      kind: 'subtask_of',
    });
    expect(res.isError).toBe(true);
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
  let taskAId: string;

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
    const resA = json<CreateResult>(await tCall('tasks_create', { title: 'Task A', description: 'First task', priority: 'high', tags: ['a'] }));
    taskAId = resA.taskId;
    await tCall('tasks_create', { title: 'Task B', description: 'Second task', priority: 'medium', tags: ['b'] });
  });

  afterAll(async () => {
    await tCtx.close();
  });

  it('create_task_link to docs', async () => {
    const res = json<CrossLinkResult>(await tCall('tasks_create_link', {
      taskId: taskAId,
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
  });

  it('create_task_link to code', async () => {
    const res = json<CrossLinkResult>(await tCall('tasks_create_link', {
      taskId: taskAId,
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      kind: 'fixes',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
  });

  it('create_task_link duplicate returns error', async () => {
    const res = await tCall('tasks_create_link', {
      taskId: taskAId,
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('create_task_link invalid target returns error', async () => {
    const res = await tCall('tasks_create_link', {
      taskId: taskAId,
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
    expect(results[0].taskId).toBe(taskAId);
    expect(results[0].kind).toBe('references');
  });

  it('find_linked_tasks finds task linked to code', async () => {
    const results = json<LinkedTaskResult[]>(await tCall('tasks_find_linked', {
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].taskId).toBe(taskAId);
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
      taskId: taskAId,
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
    const del = json<{ taskId: string; deleted: boolean }>(await tCall('tasks_delete', { taskId: taskAId }));
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
  let myTaskId: string;
  let myNoteId: string;

  beforeAll(async () => {
    kCtx = await setupMcpClient({
      knowledgeGraph: kKnowledgeGraph,
      taskGraph: kTaskGraph,
      embedFn: kFakeEmbed,
    });
    kCall = kCtx.call;

    // Create a task and a note
    const taskRes = json<CreateResult>(await kCall('tasks_create', { title: 'My Task', description: 'A task', priority: 'high' }));
    myTaskId = taskRes.taskId;
    const noteRes = json<{ noteId: string }>(await kCall('notes_create', { title: 'My Note', content: 'A note about the task' }));
    myNoteId = noteRes.noteId;
  });

  afterAll(async () => {
    await kCtx.close();
  });

  it('note can link to task via create_relation with targetGraph=tasks', async () => {
    const res = await kCall('notes_create_link', {
      fromId: myNoteId,
      toId: myTaskId,
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
      targetId: myTaskId,
      targetGraph: 'tasks',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe(myNoteId);
    expect(results[0].kind).toBe('tracks');
  });

  it('delete_relation with targetGraph=tasks removes link', async () => {
    const res = await kCall('notes_delete_link', {
      fromId: myNoteId,
      toId: myTaskId,
      targetGraph: 'tasks',
      projectId: 'test',
    });
    expect(res.isError).toBeUndefined();
    const data = json<{ deleted: boolean }>(res);
    expect(data.deleted).toBe(true);
  });

  it('proxy cleaned up after delete', async () => {
    expect(kKnowledgeGraph.hasNode(`@tasks::${myTaskId}`)).toBe(false);
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
    const noteRes = json<{ noteId: string }>(await cgCall('notes_create', { title: 'Linked Note', content: 'A note', tags: [] }));
    const linkedNoteId = noteRes.noteId;
    const taskRes = json<CreateResult>(await cgCall('tasks_create', { title: 'Linked Task', description: 'A task', priority: 'high' }));
    const linkedTaskId = taskRes.taskId;
    await cgCall('tasks_create_link', {
      taskId: linkedTaskId,
      targetId: linkedNoteId,
      targetGraph: 'knowledge',
      kind: 'references',
      projectId: 'test',
    });

    // Verify proxy exists in TaskGraph (project-scoped proxy ID)
    expect(cgTaskGraph.hasNode(`@knowledge::test::${linkedNoteId}`)).toBe(true);

    // Delete the note
    await cgCall('notes_delete', { noteId: linkedNoteId });

    // Proxy in TaskGraph should be cleaned up
    expect(cgTaskGraph.hasNode(`@knowledge::test::${linkedNoteId}`)).toBe(false);
  });

  it('delete_task cleans up proxy in KnowledgeGraph', async () => {
    // Create note and task, link note → task
    const noteRes = json<{ noteId: string }>(await cgCall('notes_create', { title: 'Another Note', content: 'A note', tags: [] }));
    const anotherNoteId = noteRes.noteId;
    const taskRes = json<CreateResult>(await cgCall('tasks_create', { title: 'Another Task', description: 'A task', priority: 'high' }));
    const anotherTaskId = taskRes.taskId;
    await cgCall('notes_create_link', {
      fromId: anotherNoteId,
      toId: anotherTaskId,
      kind: 'tracks',
      targetGraph: 'tasks',
      projectId: 'test',
    });

    // Verify proxy exists in KnowledgeGraph (project-scoped proxy ID)
    expect(cgKnowledgeGraph.hasNode(`@tasks::test::${anotherTaskId}`)).toBe(true);

    // Delete the task
    await cgCall('tasks_delete', { taskId: anotherTaskId });

    // Proxy in KnowledgeGraph should be cleaned up
    expect(cgKnowledgeGraph.hasNode(`@tasks::test::${anotherTaskId}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reverse-side deletion: delete cross-graph link from target side
// ---------------------------------------------------------------------------

describe('Reverse-side cross-graph link deletion', () => {
  const rTaskGraph = createTaskGraph();
  const rKnowledgeGraph = createKnowledgeGraph();
  const rFakeEmbed = createFakeEmbed([['task', 10], ['note', 11]]);
  let rCtx: McpTestContext;
  let rCall: McpTestContext['call'];

  beforeAll(async () => {
    rCtx = await setupMcpClient({
      knowledgeGraph: rKnowledgeGraph,
      taskGraph: rTaskGraph,
      embedFn: rFakeEmbed,
    });
    rCall = rCtx.call;
  });

  afterAll(async () => {
    await rCtx.close();
  });

  let revNoteId: string;
  let revTaskId: string;
  let revNote2Id: string;
  let revTask2Id: string;

  it('note→task link can be deleted from task side', async () => {
    // Create note and task
    const noteRes = json<{ noteId: string }>(await rCall('notes_create', { title: 'Rev Note', content: 'note for reverse test' }));
    revNoteId = noteRes.noteId;
    const taskRes = json<CreateResult>(await rCall('tasks_create', { title: 'Rev Task', description: 'task for reverse test', priority: 'medium' }));
    revTaskId = taskRes.taskId;

    // Create link from note to task
    const link = json<{ created: boolean }>(await rCall('notes_create_link', {
      fromId: revNoteId,
      toId: revTaskId,
      kind: 'tracks',
      targetGraph: 'tasks',
      projectId: 'test',
    }));
    expect(link.created).toBe(true);

    // Verify mirror proxy exists in TaskGraph (project-scoped)
    expect(rTaskGraph.hasNode(`@knowledge::test::${revNoteId}`)).toBe(true);

    // Delete from task side
    const del = json<CrossDeleteResult>(await rCall('tasks_delete_link', {
      taskId: revTaskId,
      targetId: revNoteId,
      targetGraph: 'knowledge',
      projectId: 'test',
    }));
    expect(del.deleted).toBe(true);
  });

  it('after reverse-side deletion, mirror proxy is cleaned up in TaskGraph', () => {
    expect(rTaskGraph.hasNode(`@knowledge::test::${revNoteId}`)).toBe(false);
    expect(rTaskGraph.hasNode(`@knowledge::${revNoteId}`)).toBe(false);
  });

  it('after reverse-side deletion, original proxy is cleaned up in KnowledgeGraph', () => {
    expect(rKnowledgeGraph.hasNode(`@tasks::test::${revTaskId}`)).toBe(false);
    expect(rKnowledgeGraph.hasNode(`@tasks::${revTaskId}`)).toBe(false);
  });

  it('task→note link can be deleted from note side', async () => {
    // Create new note and task
    const noteRes = json<{ noteId: string }>(await rCall('notes_create', { title: 'Rev Note 2', content: 'another note' }));
    revNote2Id = noteRes.noteId;
    const taskRes = json<CreateResult>(await rCall('tasks_create', { title: 'Rev Task 2', description: 'another task', priority: 'low' }));
    revTask2Id = taskRes.taskId;

    // Create link from task to note
    const link = json<{ created: boolean }>(await rCall('tasks_create_link', {
      taskId: revTask2Id,
      targetId: revNote2Id,
      targetGraph: 'knowledge',
      kind: 'references',
      projectId: 'test',
    }));
    expect(link.created).toBe(true);

    // Verify mirror proxy exists in KnowledgeGraph (project-scoped)
    expect(rKnowledgeGraph.hasNode(`@tasks::test::${revTask2Id}`)).toBe(true);

    // Delete from note side
    const del = json<{ deleted: boolean }>(await rCall('notes_delete_link', {
      fromId: revNote2Id,
      toId: revTask2Id,
      targetGraph: 'tasks',
      projectId: 'test',
    }));
    expect(del.deleted).toBe(true);
  });

  it('after note-side deletion, mirror proxy is cleaned up in KnowledgeGraph', () => {
    expect(rKnowledgeGraph.hasNode(`@tasks::test::${revTask2Id}`)).toBe(false);
    expect(rKnowledgeGraph.hasNode(`@tasks::${revTask2Id}`)).toBe(false);
  });

  it('after note-side deletion, original proxy is cleaned up in TaskGraph', () => {
    expect(rTaskGraph.hasNode(`@knowledge::test::${revNote2Id}`)).toBe(false);
    expect(rTaskGraph.hasNode(`@knowledge::${revNote2Id}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Same-graph task-to-task links via tasks_create_link / tasks_delete_link
// ---------------------------------------------------------------------------

describe('Same-graph task links via tasks_create_link/tasks_delete_link', () => {
  const sgTaskGraph = createTaskGraph();
  const sgFakeEmbed = createFakeEmbed([['task', 10]]);
  let sgCtx: McpTestContext;
  let sgCall: McpTestContext['call'];
  let parentTaskId: string;
  let childTaskId: string;

  beforeAll(async () => {
    sgCtx = await setupMcpClient({
      taskGraph: sgTaskGraph,
      embedFn: sgFakeEmbed,
    });
    sgCall = sgCtx.call;

    const p = json<CreateResult>(await sgCall('tasks_create', { title: 'Parent Task', description: 'parent', priority: 'high' }));
    parentTaskId = p.taskId;
    const c = json<CreateResult>(await sgCall('tasks_create', { title: 'Child Task', description: 'child', priority: 'medium' }));
    childTaskId = c.taskId;
  });

  afterAll(async () => {
    await sgCtx.close();
  });

  it('tasks_create_link without targetGraph creates same-graph link', async () => {
    const res = json<{ taskId: string; targetId: string; kind: string; created: boolean }>(
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

  it('same-graph link appears in task graph', () => {
    expect(sgTaskGraph.hasEdge(parentTaskId, childTaskId)).toBe(true);
  });

  it('tasks_delete_link without targetGraph removes same-graph link', async () => {
    const res = json<{ taskId: string; targetId: string; deleted: boolean }>(
      await sgCall('tasks_delete_link', {
        taskId: parentTaskId,
        targetId: childTaskId,
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after deletion, link no longer exists in graph', () => {
    expect(sgTaskGraph.hasEdge(parentTaskId, childTaskId)).toBe(false);
  });
});
