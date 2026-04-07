/**
 * Phase 4: Epics
 *
 * Tests: CRUD, epic↔task linking, search, filters.
 */

import {
  group, test, runPhase,
  get, post, put, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk, assertIncludes,
  printSummary, runStandalone, wait,
} from './utils';

let restEpicId = '';
let mcpEpicId = '';
let taskForEpic = '';

// ─── 4.1 CRUD ────────────────────────────────────────────────────

group('4.1 CRUD — REST');

test('POST /epics — create epic', async () => {
  const res = await post('/epics', {
    title: 'REST Test Epic',
    description: 'Epic created via REST.',
    priority: 'high',
    tags: ['test', 'rest'],
  });
  assertOk(res);
  restEpicId = res.data.epicId ?? res.data.id;
  assertExists(restEpicId, 'epicId');
});

test('GET /epics/{epicId} — get epic', async () => {
  const res = await get(`/epics/${restEpicId}`);
  assertOk(res);
  assertEqual(res.data.title, 'REST Test Epic', 'title');
});

test('GET /epics — list epics', async () => {
  const res = await get('/epics');
  assertOk(res);
  const epics = res.data.results ?? res.data;
  assertIncludes(epics, (e: any) => e.id === restEpicId, 'list contains epic');
});

test('PUT /epics/{epicId} — update', async () => {
  const res = await put(`/epics/${restEpicId}`, { description: 'Updated epic.' });
  assertOk(res);
});

test('DELETE /epics/{epicId} — returns 204', async () => {
  const res = await del(`/epics/${restEpicId}`);
  assertStatus(res, 204);
});

group('4.1 CRUD — MCP');

test('MCP epics_create', async () => {
  const res = await mcpCall('epics_create', {
    title: 'MCP Test Epic',
    description: 'Created via MCP.',
    priority: 'medium',
    tags: ['test', 'mcp'],
  });
  assertMcpOk(res);
  mcpEpicId = res.data.epicId ?? res.data.id;
  assertExists(mcpEpicId, 'epicId');
});

test('MCP epics_get — matches', async () => {
  const res = await mcpCall('epics_get', { epicId: mcpEpicId });
  assertMcpOk(res);
  assertEqual(res.data.title, 'MCP Test Epic', 'title');
});

test('MCP epics_list — contains epic', async () => {
  const res = await mcpCall('epics_list');
  assertMcpOk(res);
  const epics = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assertIncludes(epics, (e: any) => e.id === mcpEpicId, 'list contains epic');
});

test('MCP epics_update — reflected', async () => {
  const res = await mcpCall('epics_update', {
    epicId: mcpEpicId,
    description: 'Updated via MCP.',
  });
  assertMcpOk(res);
  const check = await mcpCall('epics_get', { epicId: mcpEpicId });
  assertEqual(check.data.description, 'Updated via MCP.', 'description');
});

test('MCP epics_delete', async () => {
  const res = await mcpCall('epics_delete', { epicId: mcpEpicId });
  assertMcpOk(res);
});

// ─── 4.2 Epic ↔ Task linking ────────────────────────────────────

group('4.2 Epic ↔ Task linking');

test('Create epic + task for linking', async () => {
  let res = await post('/epics', {
    title: 'Link Test Epic',
    description: 'Testing linking.',
    priority: 'medium',
  });
  assertOk(res);
  mcpEpicId = res.data.epicId ?? res.data.id;

  res = await post('/tasks', {
    title: 'Epic Child Task',
    description: 'Task to link to epic.',
    priority: 'medium',
  });
  assertOk(res);
  taskForEpic = res.data.taskId ?? res.data.id;
});

test('REST POST /epics/{epicId}/link — link task', async () => {
  const res = await post(`/epics/${mcpEpicId}/link`, { taskId: taskForEpic });
  assertOk(res);
});

test('REST GET /epics/{epicId} — shows linked tasks', async () => {
  const res = await get(`/epics/${mcpEpicId}`);
  assertOk(res);
  const tasks = res.data.tasks ?? [];
  assert(tasks.length > 0, 'should show linked task');
});

test('REST GET /epics/{epicId}/tasks — lists tasks', async () => {
  const res = await get(`/epics/${mcpEpicId}/tasks`);
  assertOk(res);
  const tasks = res.data.results ?? res.data;
  assert(Array.isArray(tasks), 'tasks should be array');
  assert(tasks.length > 0, 'should list tasks');
});

test('REST DELETE /epics/{epicId}/link — unlink task', async () => {
  const res = await del(`/epics/${mcpEpicId}/link`, { taskId: taskForEpic });
  assertOk(res);
});

test('MCP epics_link_task', async () => {
  const res = await mcpCall('epics_link_task', {
    epicId: mcpEpicId,
    taskId: taskForEpic,
  });
  assertMcpOk(res);
});

test('MCP epics_get — shows tasks', async () => {
  const res = await mcpCall('epics_get', { epicId: mcpEpicId });
  assertMcpOk(res);
  const tasks = res.data.tasks ?? [];
  assert(tasks.length > 0, 'should show linked task');
});

test('MCP epics_unlink_task', async () => {
  const res = await mcpCall('epics_unlink_task', {
    epicId: mcpEpicId,
    taskId: taskForEpic,
  });
  assertMcpOk(res);
});

// ─── 4.3 Search ──────────────────────────────────────────────────

group('4.3 Search');

test('REST GET /epics/search?q=link — finds epic', async () => {
  await wait(500);
  const res = await get('/epics/search?q=link+test');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find epic');
});

test('MCP epics_search — finds epic', async () => {
  const res = await mcpCall('epics_search', { query: 'link test' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find epic');
});

// ─── 4.4 Filters ────────────────────────────────────────────────

group('4.4 Filters');

test('epics_list with status filter', async () => {
  const res = await mcpCall('epics_list', { status: 'open' });
  assertMcpOk(res);
});

test('epics_list with priority filter', async () => {
  const res = await mcpCall('epics_list', { priority: 'medium' });
  assertMcpOk(res);
});

test('epics_list with filter (text)', async () => {
  const res = await mcpCall('epics_list', { filter: 'Link' });
  assertMcpOk(res);
  const epics = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(epics.length > 0, 'should find by text filter');
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete test data', async () => {
  if (mcpEpicId) try { await del(`/epics/${mcpEpicId}`); } catch {}
  if (taskForEpic) try { await del(`/tasks/${taskForEpic}`); } catch {}
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 4: Epics');
}

if (process.argv[1]?.includes('04-')) {
  runStandalone(run);
}
