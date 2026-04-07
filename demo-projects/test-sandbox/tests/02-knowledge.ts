/**
 * Phase 2: Knowledge (Notes)
 *
 * Tests: CRUD, search, relations, cross-graph links, file mirror, attachments, filters.
 */

import {
  group, test, runPhase,
  get, post, put, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk, assertIncludes,
  printSummary, runStandalone, wait,
  fileExists, readFile, projectPath,
} from './utils';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// Shared state
let restNoteId = '';
let mcpNoteId = '';
let noteA_Id = '';
let noteB_Id = '';
let codeSymbolId = '';

// ─── 2.1 CRUD ────────────────────────────────────────────────────

group('2.1 CRUD — REST');

test('POST /knowledge/notes — create note', async () => {
  const res = await post('/knowledge/notes', {
    title: 'REST Test Note',
    content: 'This is a test note created via REST API.',
    tags: ['test', 'rest'],
  });
  assertOk(res);
  restNoteId = res.data.noteId ?? res.data.id;
  assertExists(restNoteId, 'noteId');
});

test('GET /knowledge/notes/{noteId} — get note', async () => {
  const res = await get(`/knowledge/notes/${restNoteId}`);
  assertOk(res);
  assertEqual(res.data.title, 'REST Test Note', 'title');
  assert(res.data.tags?.includes('test'), 'should have tag "test"');
});

test('GET /knowledge/notes — list notes contains created note', async () => {
  const res = await get('/knowledge/notes');
  assertOk(res);
  const notes = res.data.results ?? res.data;
  assertIncludes(notes, (n: any) => n.id === restNoteId, 'list contains note');
});

test('PUT /knowledge/notes/{noteId} — update title', async () => {
  const res = await put(`/knowledge/notes/${restNoteId}`, { title: 'Updated REST Note' });
  assertOk(res);
});

test('GET after update — title changed', async () => {
  const res = await get(`/knowledge/notes/${restNoteId}`);
  assertOk(res);
  assertEqual(res.data.title, 'Updated REST Note', 'updated title');
});

test('DELETE /knowledge/notes/{noteId} — returns 204', async () => {
  const res = await del(`/knowledge/notes/${restNoteId}`);
  assertStatus(res, 204);
});

test('GET after delete — returns 404', async () => {
  const res = await get(`/knowledge/notes/${restNoteId}`);
  assertStatus(res, 404);
});

group('2.1 CRUD — MCP');

test('MCP notes_create', async () => {
  const res = await mcpCall('notes_create', {
    title: 'MCP Test Note',
    content: 'Created via MCP tool.',
    tags: ['test', 'mcp'],
  });
  assertMcpOk(res);
  mcpNoteId = res.data.noteId ?? res.data.id;
  assertExists(mcpNoteId, 'noteId');
});

test('MCP notes_get — matches created data', async () => {
  const res = await mcpCall('notes_get', { noteId: mcpNoteId });
  assertMcpOk(res);
  assertEqual(res.data.title, 'MCP Test Note', 'title');
});

test('MCP notes_list — contains note', async () => {
  const res = await mcpCall('notes_list');
  assertMcpOk(res);
  const notes = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assertIncludes(notes, (n: any) => n.id === mcpNoteId, 'list contains note');
});

test('MCP notes_update — update content', async () => {
  const res = await mcpCall('notes_update', {
    noteId: mcpNoteId,
    content: 'Updated content via MCP.',
  });
  assertMcpOk(res);
});

test('MCP notes_get — content updated', async () => {
  const res = await mcpCall('notes_get', { noteId: mcpNoteId });
  assertMcpOk(res);
  assertEqual(res.data.content, 'Updated content via MCP.', 'content');
});

test('MCP notes_delete', async () => {
  const res = await mcpCall('notes_delete', { noteId: mcpNoteId });
  assertMcpOk(res);
});

// ─── 2.2 Search ──────────────────────────────────────────────────

group('2.2 Search');

test('Create note for search tests', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Quantum Computing Basics',
    content: 'Quantum computing uses qubits instead of classical bits to perform calculations.',
    tags: ['science', 'computing'],
  });
  assertOk(res);
  noteA_Id = res.data.noteId ?? res.data.id;
});

test('REST GET /knowledge/search?q=quantum — finds note', async () => {
  await wait(500); // wait for embedding
  const res = await get('/knowledge/search?q=quantum');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find quantum note');
});

test('MCP notes_search — finds note', async () => {
  const res = await mcpCall('notes_search', { query: 'quantum computing' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find quantum note');
});

// ─── 2.3 Relations (note-to-note) ────────────────────────────────

group('2.3 Relations (note-to-note)');

test('Create second note for relations', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Machine Learning Intro',
    content: 'Machine learning is a subset of AI that learns from data.',
    tags: ['science', 'ml'],
  });
  assertOk(res);
  noteB_Id = res.data.noteId ?? res.data.id;
});

test('REST POST /knowledge/relations — create relation', async () => {
  const res = await post('/knowledge/relations', {
    fromId: noteA_Id,
    toId: noteB_Id,
    kind: 'related_to',
  });
  assertOk(res);
});

test('REST GET /knowledge/notes/{id}/relations — lists relation', async () => {
  const res = await get(`/knowledge/notes/${noteA_Id}/relations`);
  assertOk(res);
  const rels = res.data.results ?? res.data;
  assert(Array.isArray(rels), 'relations should be array');
  assert(rels.length > 0, 'should have relation');
});

test('REST DELETE /knowledge/relations — remove relation', async () => {
  const res = await del('/knowledge/relations', {
    fromId: noteA_Id,
    toId: noteB_Id,
  });
  assertOk(res);
});

test('MCP notes_create_link — create relation', async () => {
  const res = await mcpCall('notes_create_link', {
    fromId: noteA_Id,
    toId: noteB_Id,
    kind: 'related_to',
  });
  assertMcpOk(res);
});

test('MCP notes_list_links — lists relations', async () => {
  const res = await mcpCall('notes_list_links', { noteId: noteA_Id });
  assertMcpOk(res);
  const rels = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(rels.length > 0, 'should have relation');
});

test('MCP notes_delete_link — remove relation', async () => {
  const res = await mcpCall('notes_delete_link', {
    fromId: noteA_Id,
    toId: noteB_Id,
    kind: 'related_to',
  });
  assertMcpOk(res);
});

// ─── 2.4 Cross-graph links ──────────────────────────────────────

group('2.4 Cross-graph links');

test('Get a code symbol ID for cross-linking', async () => {
  const res = await get('/code/files');
  assertOk(res);
  const files = res.data.results ?? res.data;
  const fileId = files[0]?.fileId ?? files[0]?.id;
  const symRes = await get(`/code/files/${fileId}/symbols`);
  assertOk(symRes);
  const symbols = symRes.data.results ?? symRes.data;
  codeSymbolId = symbols[0]?.id;
  assertExists(codeSymbolId, 'code symbol id');
});

test('MCP notes_create_link with targetGraph: "code"', async () => {
  const res = await mcpCall('notes_create_link', {
    fromId: noteA_Id,
    toId: codeSymbolId,
    kind: 'references',
    targetGraph: 'code',
  });
  assertMcpOk(res);
});

test('MCP notes_list_links — shows cross-graph link', async () => {
  const res = await mcpCall('notes_list_links', { noteId: noteA_Id });
  assertMcpOk(res);
  const rels = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  // Cross-graph link may appear as targetGraph or toGraph depending on format
  assertIncludes(rels, (r: any) =>
    r.targetGraph === 'code' || r.toGraph === 'code',
    'cross-graph link to code',
  );
});

test('MCP notes_find_linked — find notes linked to code symbol', async () => {
  const res = await mcpCall('notes_find_linked', {
    targetId: codeSymbolId,
    targetGraph: 'code',
  });
  assertMcpOk(res);
  const notes = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(notes.length > 0, 'should find linked notes');
});

test('REST GET /knowledge/linked — same result', async () => {
  const res = await get(`/knowledge/linked?targetGraph=code&targetNodeId=${codeSymbolId}`);
  assertOk(res);
  const notes = res.data.results ?? res.data;
  assert(notes.length > 0, 'should find linked notes');
});

// ─── 2.5 File mirror ────────────────────────────────────────────

group('2.5 File mirror');

test('Create note and check .notes/ file exists', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Mirror Test Note',
    content: 'Testing file mirror.',
    tags: ['mirror'],
  });
  assertOk(res);
  const noteId = res.data.noteId ?? res.data.id;
  await wait(500);

  // Check .notes directory for any file
  const notesDir = projectPath('.notes');
  assert(fileExists(notesDir), `.notes/ directory should exist at ${notesDir}`);

  // Clean up
  await del(`/knowledge/notes/${noteId}`);
});

// ─── 2.6 Attachments ────────────────────────────────────────────

group('2.6 Attachments');

test('Create note + test file for attachments', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Attachment Test Note',
    content: 'Testing attachments.',
  });
  assertOk(res);
  mcpNoteId = res.data.noteId ?? res.data.id;

  // Create a temp file to attach
  const testFile = projectPath('test-attachment.txt');
  writeFileSync(testFile, 'Hello, attachment!');
});

test('MCP notes_add_attachment — attach file', async () => {
  const res = await mcpCall('notes_add_attachment', {
    noteId: mcpNoteId,
    filePath: projectPath('test-attachment.txt'),
  });
  assertMcpOk(res);
  assertExists(res.data?.filename, 'filename');
});

test('REST GET /knowledge/notes/{noteId}/attachments — lists attachment', async () => {
  const res = await get(`/knowledge/notes/${mcpNoteId}/attachments`);
  assertOk(res);
  const attachments = res.data.results ?? res.data;
  assert(Array.isArray(attachments), 'attachments should be array');
  assert(attachments.length > 0, 'should have attachment');
});

test('REST GET /knowledge/notes/{noteId}/attachments/{filename} — download', async () => {
  const res = await get(`/knowledge/notes/${mcpNoteId}/attachments/test-attachment.txt`);
  assertOk(res);
});

test('MCP notes_remove_attachment — remove', async () => {
  const res = await mcpCall('notes_remove_attachment', {
    noteId: mcpNoteId,
    filename: 'test-attachment.txt',
  });
  assertMcpOk(res);
});

test('Cleanup attachment test data', async () => {
  await del(`/knowledge/notes/${mcpNoteId}`);
  try { unlinkSync(projectPath('test-attachment.txt')); } catch {}
});

// ─── 2.7 Filters ────────────────────────────────────────────────

group('2.7 Filters');

test('notes_list with filter — text search', async () => {
  const res = await mcpCall('notes_list', { filter: 'Quantum' });
  assertMcpOk(res);
  const notes = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assertIncludes(notes, (n: any) => n.title?.includes('Quantum'), 'filter by title');
});

test('notes_list with tag — filter by tag', async () => {
  const res = await mcpCall('notes_list', { tag: 'science' });
  assertMcpOk(res);
  const notes = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(notes.length >= 2, 'should find notes with science tag');
});

test('notes_list with limit', async () => {
  const res = await mcpCall('notes_list', { limit: 1 });
  assertMcpOk(res);
  const notes = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(notes.length <= 1, 'should respect limit');
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete test notes', async () => {
  if (noteA_Id) await del(`/knowledge/notes/${noteA_Id}`);
  if (noteB_Id) await del(`/knowledge/notes/${noteB_Id}`);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 2: Knowledge (Notes)');
}

if (process.argv[1]?.includes('02-')) {
  runStandalone(run);
}
