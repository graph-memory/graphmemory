/**
 * Phase 3: Tasks
 *
 * Tests: CRUD, status workflow, ordering, search, task links,
 * cross-graph links, bulk ops, file mirror, attachments, filters.
 */

import {
  group, test, runPhase,
  get, post, put, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk, assertIncludes,
  printSummary, runStandalone, wait,
  fileExists, projectPath,
} from './utils';
import { writeFileSync, unlinkSync } from 'fs';

// Shared state
let restTaskId = '';
let mcpTaskId = '';
let taskA_Id = '';
let taskB_Id = '';
let taskC_Id = '';
let bulkIds: string[] = [];
let noteIdForLink = '';

// ─── 3.1 CRUD ────────────────────────────────────────────────────

group('3.1 CRUD — REST');

test('POST /tasks — create task', async () => {
  const res = await post('/tasks', {
    title: 'REST Test Task',
    description: 'Task created via REST.',
    priority: 'high',
    tags: ['test', 'rest'],
  });
  assertOk(res);
  restTaskId = res.data.taskId ?? res.data.id;
  assertExists(restTaskId, 'taskId');
});

test('GET /tasks/{taskId} — get task', async () => {
  const res = await get(`/tasks/${restTaskId}`);
  assertOk(res);
  assertEqual(res.data.title, 'REST Test Task', 'title');
  assertEqual(res.data.priority, 'high', 'priority');
});

test('GET /tasks — list tasks contains created task', async () => {
  const res = await get('/tasks');
  assertOk(res);
  const tasks = res.data.results ?? res.data;
  assertIncludes(tasks, (t: any) => t.id === restTaskId, 'list contains task');
});

test('PUT /tasks/{taskId} — update description', async () => {
  const res = await put(`/tasks/${restTaskId}`, { description: 'Updated description.' });
  assertOk(res);
});

test('GET after update — description changed', async () => {
  const res = await get(`/tasks/${restTaskId}`);
  assertOk(res);
  assertEqual(res.data.description, 'Updated description.', 'updated description');
});

test('DELETE /tasks/{taskId} — returns 204', async () => {
  const res = await del(`/tasks/${restTaskId}`);
  assertStatus(res, 204);
});

group('3.1 CRUD — MCP');

test('MCP tasks_create', async () => {
  const res = await mcpCall('tasks_create', {
    title: 'MCP Test Task',
    description: 'Created via MCP.',
    priority: 'medium',
    tags: ['test', 'mcp'],
  });
  assertMcpOk(res);
  mcpTaskId = res.data.taskId ?? res.data.id;
  assertExists(mcpTaskId, 'taskId');
});

test('MCP tasks_get — matches', async () => {
  const res = await mcpCall('tasks_get', { taskId: mcpTaskId });
  assertMcpOk(res);
  assertEqual(res.data.title, 'MCP Test Task', 'title');
});

test('MCP tasks_list — contains task', async () => {
  const res = await mcpCall('tasks_list');
  assertMcpOk(res);
  const tasks = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assertIncludes(tasks, (t: any) => t.id === mcpTaskId, 'list contains task');
});

test('MCP tasks_update — update', async () => {
  const res = await mcpCall('tasks_update', {
    taskId: mcpTaskId,
    description: 'Updated via MCP.',
  });
  assertMcpOk(res);
});

test('MCP tasks_delete', async () => {
  const res = await mcpCall('tasks_delete', { taskId: mcpTaskId });
  assertMcpOk(res);
});

// ─── 3.2 Status workflow ────────────────────────────────────────

group('3.2 Status workflow');

test('Create task for status tests', async () => {
  const res = await post('/tasks', {
    title: 'Status Test Task',
    description: 'Testing status transitions.',
    priority: 'medium',
  });
  assertOk(res);
  taskA_Id = res.data.taskId ?? res.data.id;
});

test('REST POST /tasks/{id}/move to in_progress', async () => {
  const res = await post(`/tasks/${taskA_Id}/move`, { status: 'in_progress' });
  assertOk(res);
  assertEqual(res.data.status, 'in_progress', 'status');
});

test('REST POST /tasks/{id}/move to done — sets completedAt', async () => {
  const res = await post(`/tasks/${taskA_Id}/move`, { status: 'done' });
  assertOk(res);
  assertEqual(res.data.status, 'done', 'status');
  assertExists(res.data.completedAt, 'completedAt');
});

test('MCP tasks_move — back to todo', async () => {
  const res = await mcpCall('tasks_move', { taskId: taskA_Id, status: 'todo' });
  assertMcpOk(res);
  assertEqual(res.data.status, 'todo', 'status');
});

// ─── 3.3 Task ordering ─────────────────────────────────────────

group('3.3 Task ordering');

test('MCP tasks_reorder — set order', async () => {
  const res = await mcpCall('tasks_reorder', { taskId: taskA_Id, order: 10 });
  assertMcpOk(res);
});

test('REST POST /tasks/{id}/reorder', async () => {
  const res = await post(`/tasks/${taskA_Id}/reorder`, { order: 5 });
  assertOk(res);
});

// ─── 3.4 Search ──────────────────────────────────────────────────

group('3.4 Search');

test('REST GET /tasks/search?q=status — finds task', async () => {
  await wait(500);
  const res = await get('/tasks/search?q=status+transitions');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find task');
});

test('MCP tasks_search — finds task', async () => {
  const res = await mcpCall('tasks_search', { query: 'status transitions' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find task');
});

// ─── 3.5 Task links (task-to-task) ──────────────────────────────

group('3.5 Task links (task-to-task)');

test('Create second task for linking', async () => {
  const res = await post('/tasks', {
    title: 'Child Task',
    description: 'A subtask.',
    priority: 'low',
  });
  assertOk(res);
  taskB_Id = res.data.taskId ?? res.data.id;
});

test('MCP tasks_link — subtask_of', async () => {
  const res = await mcpCall('tasks_link', {
    fromId: taskB_Id,
    toId: taskA_Id,
    kind: 'subtask_of',
  });
  assertMcpOk(res);
});

test('MCP tasks_get — shows subtasks', async () => {
  const res = await mcpCall('tasks_get', { taskId: taskA_Id });
  assertMcpOk(res);
  const subtasks = res.data.subtasks ?? [];
  assert(subtasks.length > 0, 'should show subtask');
});

test('Create third task for blocks relation', async () => {
  const res = await post('/tasks', {
    title: 'Blocker Task',
    description: 'Blocks another task.',
    priority: 'high',
  });
  assertOk(res);
  taskC_Id = res.data.taskId ?? res.data.id;
});

test('MCP tasks_link — blocks', async () => {
  const res = await mcpCall('tasks_link', {
    fromId: taskC_Id,
    toId: taskA_Id,
    kind: 'blocks',
  });
  assertMcpOk(res);
});

test('MCP tasks_get — shows blockedBy', async () => {
  const res = await mcpCall('tasks_get', { taskId: taskA_Id });
  assertMcpOk(res);
  const blockedBy = res.data.blockedBy ?? [];
  assert(blockedBy.length > 0, 'should show blocker');
});

test('REST POST /tasks/links — create related_to link', async () => {
  const res = await post('/tasks/links', {
    fromId: taskB_Id,
    toId: taskC_Id,
    kind: 'related_to',
  });
  assertOk(res);
});

test('REST GET /tasks/{id}/relations — lists relations', async () => {
  const res = await get(`/tasks/${taskB_Id}/relations`);
  assertOk(res);
  const rels = res.data.results ?? res.data;
  assert(Array.isArray(rels) && rels.length > 0, 'should have relations');
});

test('REST DELETE /tasks/links — delete link', async () => {
  const res = await del('/tasks/links', {
    fromId: taskB_Id,
    toId: taskC_Id,
  });
  assertOk(res);
});

// ─── 3.6 Cross-graph links ─────────────────────────────────────

group('3.6 Cross-graph links');

test('Create note for cross-graph linking', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Linked Note',
    content: 'This note links to a task.',
  });
  assertOk(res);
  noteIdForLink = res.data.noteId ?? res.data.id;
});

test('MCP tasks_create_link — link task to note', async () => {
  const res = await mcpCall('tasks_create_link', {
    taskId: taskA_Id,
    targetId: noteIdForLink,
    targetGraph: 'knowledge',
    kind: 'references',
  });
  assertMcpOk(res);
});

test('MCP tasks_find_linked — find tasks linked to note', async () => {
  const res = await mcpCall('tasks_find_linked', {
    targetId: noteIdForLink,
    targetGraph: 'knowledge',
  });
  assertMcpOk(res);
  const tasks = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(tasks.length > 0, 'should find linked tasks');
});

test('REST GET /tasks/linked — same result', async () => {
  const res = await get(`/tasks/linked?targetGraph=knowledge&targetNodeId=${noteIdForLink}`);
  assertOk(res);
  const tasks = res.data.results ?? res.data;
  assert(tasks.length > 0, 'should find linked tasks');
});

test('MCP tasks_delete_link — remove cross-graph link', async () => {
  const res = await mcpCall('tasks_delete_link', {
    taskId: taskA_Id,
    targetId: noteIdForLink,
    targetGraph: 'knowledge',
    kind: 'references',
  });
  assertMcpOk(res);
});

// ─── 3.7 Bulk operations ────────────────────────────────────────

group('3.7 Bulk operations');

test('Create 3 tasks for bulk ops', async () => {
  bulkIds = [];
  for (let i = 1; i <= 3; i++) {
    const res = await post('/tasks', {
      title: `Bulk Task ${i}`,
      description: `Bulk task #${i}`,
      priority: 'low',
    });
    assertOk(res);
    bulkIds.push(res.data.taskId ?? res.data.id);
  }
  assertEqual(bulkIds.length, 3, 'created 3 tasks');
});

test('REST POST /tasks/bulk/move — moves multiple', async () => {
  const res = await post('/tasks/bulk/move', {
    taskIds: bulkIds,
    status: 'in_progress',
  });
  assertOk(res);
  const moved = res.data.moved ?? res.data.updated;
  assert(moved === 3 || (Array.isArray(moved) && moved.length === 3), 'moved 3');
});

test('REST POST /tasks/bulk/priority — sets priority', async () => {
  const res = await post('/tasks/bulk/priority', {
    taskIds: bulkIds,
    priority: 'critical',
  });
  assertOk(res);
});

test('MCP tasks_bulk_move', async () => {
  const res = await mcpCall('tasks_bulk_move', {
    taskIds: bulkIds,
    status: 'done',
  });
  assertMcpOk(res);
});

test('MCP tasks_bulk_priority', async () => {
  const res = await mcpCall('tasks_bulk_priority', {
    taskIds: bulkIds,
    priority: 'low',
  });
  assertMcpOk(res);
});

test('REST POST /tasks/bulk/delete — deletes multiple', async () => {
  const res = await post('/tasks/bulk/delete', { taskIds: bulkIds });
  assertOk(res);
});

test('MCP tasks_bulk_delete (create + delete)', async () => {
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const r = await mcpCall('tasks_create', {
      title: `MCP Bulk ${i}`,
      description: 'temp',
      priority: 'low',
    });
    assertMcpOk(r);
    ids.push(r.data.taskId ?? r.data.id);
  }
  const res = await mcpCall('tasks_bulk_delete', { taskIds: ids });
  assertMcpOk(res);
});

// ─── 3.8 File mirror ────────────────────────────────────────────

group('3.8 File mirror');

test('Create task and check .tasks/ file exists', async () => {
  const res = await post('/tasks', {
    title: 'Mirror Task',
    description: 'Testing file mirror.',
    priority: 'medium',
  });
  assertOk(res);
  const id = res.data.taskId ?? res.data.id;
  await wait(500);

  const tasksDir = projectPath('.tasks');
  assert(fileExists(tasksDir), `.tasks/ directory should exist at ${tasksDir}`);

  await del(`/tasks/${id}`);
});

// ─── 3.9 Attachments ────────────────────────────────────────────

group('3.9 Attachments');

test('Create task + attach file', async () => {
  const res = await post('/tasks', {
    title: 'Attachment Task',
    description: 'Testing attachments.',
    priority: 'low',
  });
  assertOk(res);
  mcpTaskId = res.data.taskId ?? res.data.id;

  writeFileSync(projectPath('task-attach.txt'), 'Task attachment content');
});

test('MCP tasks_add_attachment', async () => {
  const res = await mcpCall('tasks_add_attachment', {
    taskId: mcpTaskId,
    filePath: projectPath('task-attach.txt'),
  });
  assertMcpOk(res);
});

test('REST GET /tasks/{id}/attachments — lists', async () => {
  const res = await get(`/tasks/${mcpTaskId}/attachments`);
  assertOk(res);
  const atts = res.data.results ?? res.data;
  assert(Array.isArray(atts) && atts.length > 0, 'should have attachment');
});

test('REST GET /tasks/{id}/attachments/{filename} — download', async () => {
  const res = await get(`/tasks/${mcpTaskId}/attachments/task-attach.txt`);
  assertOk(res);
});

test('MCP tasks_remove_attachment', async () => {
  const res = await mcpCall('tasks_remove_attachment', {
    taskId: mcpTaskId,
    filename: 'task-attach.txt',
  });
  assertMcpOk(res);
});

test('Cleanup attachment test', async () => {
  await del(`/tasks/${mcpTaskId}`);
  try { unlinkSync(projectPath('task-attach.txt')); } catch {}
});

// ─── 3.10 Filters ───────────────────────────────────────────────

group('3.10 Filters');

test('tasks_list with status filter', async () => {
  const res = await mcpCall('tasks_list', { status: 'todo' });
  assertMcpOk(res);
});

test('tasks_list with priority filter', async () => {
  const res = await mcpCall('tasks_list', { priority: 'high' });
  assertMcpOk(res);
});

test('tasks_list with tag filter', async () => {
  const res = await mcpCall('tasks_list', { tag: 'test' });
  assertMcpOk(res);
});

test('tasks_list with limit', async () => {
  const res = await mcpCall('tasks_list', { limit: 1 });
  assertMcpOk(res);
  const tasks = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(tasks.length <= 1, 'should respect limit');
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete remaining test data', async () => {
  for (const id of [taskA_Id, taskB_Id, taskC_Id, noteIdForLink]) {
    if (!id) continue;
    try {
      if (id === noteIdForLink) await del(`/knowledge/notes/${id}`);
      else await del(`/tasks/${id}`);
    } catch {}
  }
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 3: Tasks');
}

if (process.argv[1]?.includes('03-')) {
  runStandalone(run);
}
