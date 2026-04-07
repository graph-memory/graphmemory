/**
 * Phase 8: Edge Cases & Error Handling
 *
 * Tests: validation errors, not found, search edge cases, duplicate operations.
 */

import {
  group, test, runPhase,
  get, post, put, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk,
  printSummary, runStandalone, wait,
} from './utils';

// ─── 8.1 Validation ─────────────────────────────────────────────

group('8.1 Validation');

test('Create note without title → 400', async () => {
  const res = await post('/knowledge/notes', { content: 'no title' });
  assertStatus(res, 400);
});

test('Create task without title → 400', async () => {
  const res = await post('/tasks', { description: 'no title', priority: 'medium' });
  assertStatus(res, 400);
});

test('Create task with invalid priority → 400', async () => {
  const res = await post('/tasks', {
    title: 'Bad Priority',
    description: 'test',
    priority: 'super-ultra-critical',
  });
  assertStatus(res, 400);
});

test('Create task with invalid status → 400', async () => {
  const res = await post('/tasks', {
    title: 'Bad Status',
    description: 'test',
    priority: 'low',
    status: 'flying',
  });
  assertStatus(res, 400);
});

test('Update with expectedVersion mismatch → 409', async () => {
  // Create a note, then try updating with wrong version
  const createRes = await post('/knowledge/notes', {
    title: 'Version Test',
    content: 'Testing optimistic locking.',
  });
  assertOk(createRes);
  const noteId = createRes.data.noteId ?? createRes.data.id;

  const res = await put(`/knowledge/notes/${noteId}`, {
    title: 'Updated',
    version: 999,
  });
  assertStatus(res, 409);

  // Cleanup
  await del(`/knowledge/notes/${noteId}`);
});

// ─── 8.2 Not found ──────────────────────────────────────────────

group('8.2 Not found');

test('GET non-existent note → 404', async () => {
  const res = await get('/knowledge/notes/nonexistent-id-12345');
  assertStatus(res, 404);
});

test('GET non-existent task → 404', async () => {
  const res = await get('/tasks/nonexistent-id-12345');
  assertStatus(res, 404);
});

test('GET non-existent epic → 404', async () => {
  const res = await get('/epics/nonexistent-id-12345');
  assertStatus(res, 404);
});

test('GET non-existent skill → 404', async () => {
  const res = await get('/skills/nonexistent-id-12345');
  assertStatus(res, 404);
});

test('GET non-existent doc node → 404', async () => {
  const res = await get('/docs/nodes/nonexistent-id-12345');
  assertStatus(res, 404);
});

test('GET non-existent code symbol → 404', async () => {
  const res = await get('/code/symbols/nonexistent-id-12345');
  assertStatus(res, 404);
});

test('GET non-existent file info → 404', async () => {
  const res = await get('/files/info?path=nonexistent/file.xyz');
  assertStatus(res, 404);
});

// ─── 8.3 Search edge cases ──────────────────────────────────────

group('8.3 Search edge cases');

test('Search with empty query → error or empty', async () => {
  const res = await get('/knowledge/search?q=');
  // Should return 400 or empty results, not 500
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('Search with very long query → handles gracefully', async () => {
  const longQuery = 'a'.repeat(5000);
  const res = await get(`/knowledge/search?q=${encodeURIComponent(longQuery)}`);
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('Search with special characters → no crash', async () => {
  const special = 'SELECT * FROM; <script>alert(1)</script> " \' `';
  const res = await get(`/knowledge/search?q=${encodeURIComponent(special)}`);
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('MCP search with searchMode: keyword', async () => {
  // Create a note with unique word to test keyword search
  const createRes = await post('/knowledge/notes', {
    title: 'Supercalifragilistic Note',
    content: 'This note has a unique word for keyword search testing.',
  });
  assertOk(createRes);
  const noteId = createRes.data.noteId ?? createRes.data.id;
  await wait(500);

  const res = await mcpCall('notes_search', {
    query: 'supercalifragilistic',
    searchMode: 'keyword',
  });
  assertMcpOk(res);

  await del(`/knowledge/notes/${noteId}`);
});

test('MCP search with searchMode: vector', async () => {
  const res = await mcpCall('notes_search', {
    query: 'machine learning algorithms',
    searchMode: 'vector',
  });
  assertMcpOk(res);
});

test('MCP search with searchMode: hybrid', async () => {
  const res = await mcpCall('notes_search', {
    query: 'test',
    searchMode: 'hybrid',
  });
  assertMcpOk(res);
});

test('MCP search with bfsDepth > 0', async () => {
  const res = await mcpCall('docs_search', {
    query: 'sandbox',
    bfsDepth: 1,
  });
  assertMcpOk(res);
});

test('MCP search with minScore filter', async () => {
  const res = await mcpCall('docs_search', {
    query: 'installation',
    minScore: 0.5,
  });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  // All results should have score >= 0.5
  for (const r of results) {
    assert((r.score ?? 1) >= 0.5, `score ${r.score} should be >= 0.5`);
  }
});

// ─── 8.4 Duplicate operations ───────────────────────────────────

group('8.4 Duplicate operations');

test('Delete already-deleted note → 404', async () => {
  const createRes = await post('/knowledge/notes', {
    title: 'To Delete Twice',
    content: 'temp',
  });
  assertOk(createRes);
  const id = createRes.data.noteId ?? createRes.data.id;

  await del(`/knowledge/notes/${id}`);
  const res = await del(`/knowledge/notes/${id}`);
  assertStatus(res, 404);
});

test('Double move to same status → no error', async () => {
  const createRes = await post('/tasks', {
    title: 'Double Move',
    description: 'test',
    priority: 'low',
  });
  assertOk(createRes);
  const id = createRes.data.taskId ?? createRes.data.id;

  await post(`/tasks/${id}/move`, { status: 'in_progress' });
  const res = await post(`/tasks/${id}/move`, { status: 'in_progress' });
  assert(res.status < 500, `double move should not 500, got ${res.status}`);

  await del(`/tasks/${id}`);
});

test('Create link that already exists → idempotent or error (not 500)', async () => {
  const n1 = await post('/knowledge/notes', { title: 'Link A', content: 'a' });
  const n2 = await post('/knowledge/notes', { title: 'Link B', content: 'b' });
  assertOk(n1);
  assertOk(n2);
  const id1 = n1.data.noteId ?? n1.data.id;
  const id2 = n2.data.noteId ?? n2.data.id;

  await post('/knowledge/relations', { fromId: id1, toId: id2, kind: 'related_to' });
  const res = await post('/knowledge/relations', { fromId: id1, toId: id2, kind: 'related_to' });
  assert(res.status < 500, `duplicate link should not 500, got ${res.status}`);

  await del(`/knowledge/notes/${id1}`);
  await del(`/knowledge/notes/${id2}`);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 8: Edge Cases & Error Handling');
}

if (process.argv[1]?.includes('08-')) {
  runStandalone(run);
}
