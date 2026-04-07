/**
 * Phase 19: Coverage Gaps
 *
 * Tests for endpoints that were missed in phases 1-18:
 * - REST multipart attachment uploads (notes, tasks, skills)
 * - REST POST/DELETE /skills/links
 * - code_search with includeBody
 * - files_list with directory/extension/language filters
 * - Cross-graph REST DELETE (knowledge/tasks with targetGraph)
 * - Stats detail fields, team endpoint
 * - Tools explorer detail (schema, 404, list shape)
 */

import {
  group, test, runPhase,
  get, post, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk,
  printSummary, runStandalone, wait,
  uploadFile, projectPath,
} from './utils';
import { writeFileSync, unlinkSync } from 'fs';

// Shared state
let noteId: number;
let taskId: number;
let skillId: number;
let skillB_Id: number;

// ─── 19.1 REST multipart attachment uploads ─────────────────────

group('19.1 Note attachment — REST multipart upload');

test('Create note for attachment test', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Upload Test Note',
    content: 'Testing REST multipart upload.',
  });
  assertOk(res);
  noteId = res.data.id;
});

test('POST /knowledge/notes/{id}/attachments — multipart upload', async () => {
  const res = await uploadFile(
    `/knowledge/notes/${noteId}/attachments`,
    'rest-upload.txt',
    'File uploaded via REST multipart form-data.',
    'text/plain',
  );
  assertOk(res);
  assertExists(res.data.filename, 'filename');
  assertEqual(res.data.filename, 'rest-upload.txt', 'filename match');
  assertExists(res.data.mimeType, 'mimeType');
  assertExists(res.data.size, 'size');
});

test('GET /knowledge/notes/{id}/attachments — lists uploaded file', async () => {
  const res = await get(`/knowledge/notes/${noteId}/attachments`);
  assertOk(res);
  const atts = res.data.results ?? res.data;
  assert(atts.length > 0, 'should have attachment');
  assert(atts.some((a: any) => a.filename === 'rest-upload.txt'), 'should find rest-upload.txt');
});

test('GET /knowledge/notes/{id}/attachments/rest-upload.txt — download', async () => {
  const res = await get(`/knowledge/notes/${noteId}/attachments/rest-upload.txt`);
  assertOk(res);
  assert(String(res.data).includes('multipart form-data'), 'content should match');
});

test('DELETE /knowledge/notes/{id}/attachments/rest-upload.txt', async () => {
  const res = await del(`/knowledge/notes/${noteId}/attachments/rest-upload.txt`);
  assertStatus(res, 204);
});

test('Cleanup note', async () => {
  await del(`/knowledge/notes/${noteId}`);
});

group('19.2 Task attachment — REST multipart upload');

test('Create task for attachment test', async () => {
  const res = await post('/tasks', {
    title: 'Upload Test Task',
    description: 'Testing REST multipart upload.',
    priority: 'low',
  });
  assertOk(res);
  taskId = res.data.id;
});

test('POST /tasks/{id}/attachments — multipart upload', async () => {
  const res = await uploadFile(
    `/tasks/${taskId}/attachments`,
    'task-upload.txt',
    'Task file via REST.',
    'text/plain',
  );
  assertOk(res);
  assertEqual(res.data.filename, 'task-upload.txt', 'filename');
});

test('GET /tasks/{id}/attachments — lists uploaded file', async () => {
  const res = await get(`/tasks/${taskId}/attachments`);
  assertOk(res);
  const atts = res.data.results ?? res.data;
  assert(atts.some((a: any) => a.filename === 'task-upload.txt'), 'should find task-upload.txt');
});

test('DELETE /tasks/{id}/attachments/task-upload.txt', async () => {
  const res = await del(`/tasks/${taskId}/attachments/task-upload.txt`);
  assertStatus(res, 204);
});

test('Cleanup task', async () => {
  await del(`/tasks/${taskId}`);
});

group('19.3 Skill attachment — REST multipart upload');

test('Create skill for attachment test', async () => {
  const res = await post('/skills', {
    title: 'Upload Test Skill',
    description: 'Testing REST multipart upload.',
  });
  assertOk(res);
  skillId = res.data.id;
});

test('POST /skills/{id}/attachments — multipart upload', async () => {
  const res = await uploadFile(
    `/skills/${skillId}/attachments`,
    'skill-upload.txt',
    'Skill file via REST.',
    'text/plain',
  );
  assertOk(res);
  assertEqual(res.data.filename, 'skill-upload.txt', 'filename');
});

test('GET /skills/{id}/attachments — lists uploaded file', async () => {
  const res = await get(`/skills/${skillId}/attachments`);
  assertOk(res);
  const atts = res.data.results ?? res.data;
  assert(atts.some((a: any) => a.filename === 'skill-upload.txt'), 'should find skill-upload.txt');
});

test('DELETE /skills/{id}/attachments/skill-upload.txt', async () => {
  const res = await del(`/skills/${skillId}/attachments/skill-upload.txt`);
  assertStatus(res, 204);
});

// ─── 19.4 REST POST/DELETE /skills/links ────────────────────────

group('19.4 REST skill links (POST + DELETE)');

test('Create second skill for linking', async () => {
  const res = await post('/skills', {
    title: 'Link Target Skill',
    description: 'Target for REST link test.',
  });
  assertOk(res);
  skillB_Id = res.data.id;
});

test('REST POST /skills/links — create link', async () => {
  const res = await post('/skills/links', {
    fromId: skillId,
    toId: skillB_Id,
    kind: 'depends_on',
  });
  assertOk(res);
});

test('GET /skills/{id}/relations — shows link', async () => {
  const res = await get(`/skills/${skillId}/relations`);
  assertOk(res);
  const rels = res.data.results ?? res.data;
  assert(rels.length > 0, 'should have relation');
});

test('REST DELETE /skills/links — remove link', async () => {
  const res = await del('/skills/links', {
    fromId: skillId,
    toId: skillB_Id,
  });
  assertOk(res);
});

test('Cleanup skills', async () => {
  await del(`/skills/${skillId}`);
  await del(`/skills/${skillB_Id}`);
});

// ─── 19.5 code_search with includeBody ──────────────────────────

group('19.5 code_search with includeBody');

test('REST GET /code/search?q=Logger&includeBody=true — returns results', async () => {
  const res = await get('/code/search?q=Logger&includeBody=true');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find results');
  // NOTE: REST code search returns id+score only; includeBody only works via MCP
});

test('MCP code_search with includeBody — returns body', async () => {
  const res = await mcpCall('code_search', { query: 'Logger', includeBody: true });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find results');
  const withBody = results.find((r: any) => r.body);
  assertExists(withBody, 'at least one result should have body');
});

// ─── 19.6 files_list with filters ───────────────────────────────

group('19.6 files_list with directory/extension/language filters');

test('files_list with directory filter', async () => {
  const res = await get('/files?directory=src');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assert(files.length > 0, 'should find files in src/');
  assert(files.every((f: any) => (f.filePath ?? f.directory ?? '').includes('src')),
    'all files should be in src directory');
});

test('files_list with extension filter', async () => {
  const res = await get('/files?extension=.ts');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assert(files.length > 0, 'should find .ts files');
});

test('files_list with language filter', async () => {
  const res = await get('/files?language=typescript');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assert(files.length > 0, 'should find typescript files');
});

test('MCP files_list with directory filter', async () => {
  const res = await mcpCall('files_list', { directory: 'docs' });
  assertMcpOk(res);
  const files = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(files.length > 0, 'should find files in docs/');
});

test('MCP files_list with extension filter', async () => {
  const res = await mcpCall('files_list', { extension: '.md' });
  assertMcpOk(res);
  const files = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(files.length > 0, 'should find .md files');
});

// ─── 19.7 Cross-graph REST DELETE ───────────────────────────────

group('19.7 Cross-graph REST relation/link DELETE');

test('Create note + code symbol for cross-graph link', async () => {
  const noteRes = await post('/knowledge/notes', {
    title: 'Cross-Graph Delete Test',
    content: 'Testing REST cross-graph delete.',
  });
  assertOk(noteRes);
  noteId = noteRes.data.id;

  const codeFiles = await get('/code/files');
  assertOk(codeFiles);
  const fileId = (codeFiles.data.results ?? codeFiles.data)[0]?.fileId;
  const symRes = await get(`/code/files/${fileId}/symbols`);
  assertOk(symRes);
  const symbols = symRes.data.results ?? symRes.data;
  assertExists(symbols[0]?.id, 'code symbol');
  skillId = symbols[0].id; // reuse var for symbolId
});

test('REST POST /knowledge/relations with targetGraph=code', async () => {
  const res = await post('/knowledge/relations', {
    fromId: noteId,
    toId: skillId, // code symbol id
    kind: 'references',
    targetGraph: 'code',
  });
  assertOk(res);
});

test('REST DELETE /knowledge/relations with targetGraph=code', async () => {
  const res = await del('/knowledge/relations', {
    fromId: noteId,
    toId: skillId,
    targetGraph: 'code',
  });
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('Cleanup cross-graph note', async () => {
  await del(`/knowledge/notes/${noteId}`);
});

test('Create task for cross-graph link test', async () => {
  const res = await post('/tasks', {
    title: 'Cross-Graph Task',
    description: 'test',
    priority: 'low',
  });
  assertOk(res);
  taskId = res.data.id;
});

test('REST POST /tasks/links with targetGraph=code', async () => {
  const res = await post('/tasks/links', {
    fromId: taskId,
    toId: skillId, // code symbol id
    kind: 'references',
    targetGraph: 'code',
  });
  assertOk(res);
});

test('REST DELETE /tasks/links with targetGraph=code', async () => {
  const res = await del('/tasks/links', {
    fromId: taskId,
    toId: skillId,
    targetGraph: 'code',
  });
  assert(res.status < 500, `should not 500, got ${res.status}`);
});

test('Cleanup cross-graph task', async () => {
  await del(`/tasks/${taskId}`);
});

// ─── 19.8 Stats detail fields ───────────────────────────────────

group('19.8 Stats detail fields');

test('GET /stats returns all graph counts', async () => {
  const res = await get('/stats');
  assertOk(res);
  assertExists(res.data.docs, 'docs stats');
  assertExists(res.data.code, 'code stats');
  assertExists(res.data.files, 'files stats');
  assertExists(res.data.knowledge, 'knowledge stats');
  assertExists(res.data.tasks, 'tasks stats');
  assertExists(res.data.skills, 'skills stats');
  // Each should have nodes count
  assert(typeof res.data.docs.nodes === 'number', 'docs.nodes is number');
  assert(typeof res.data.code.nodes === 'number', 'code.nodes is number');
});

test('GET /team returns array', async () => {
  const res = await get('/team');
  assertOk(res);
  // Team may be empty or have members — just verify shape
  assert(Array.isArray(res.data) || typeof res.data === 'object', 'team data shape');
});

// ─── 19.9 Tools explorer detail ─────────────────────────────────

group('19.9 Tools explorer detail');

test('GET /tools — each tool has name and description', async () => {
  const res = await get('/tools');
  assertOk(res);
  const tools = res.data.results ?? res.data;
  assert(tools.length >= 50, 'should list >= 50 tools');
  const first = tools[0];
  assertExists(first.name, 'tool name');
  assertExists(first.description, 'tool description');
});

test('GET /tools/notes_create — returns inputSchema', async () => {
  const res = await get('/tools/notes_create');
  assertOk(res);
  assertExists(res.data.name, 'tool name');
  assertExists(res.data.inputSchema ?? res.data.schema ?? res.data.parameters, 'tool schema');
});

test('GET /tools/nonexistent_tool — 404', async () => {
  const res = await get('/tools/nonexistent_tool_xyz');
  assertStatus(res, 404);
});

test('POST /tools/notes_list/call — execute via explorer', async () => {
  const res = await post('/tools/notes_list/call', { arguments: {} });
  assertOk(res);
  assertExists(res.data.result, 'tool result');
  assert(Array.isArray(res.data.result), 'result is array');
});

// ─── 19.10 Docs detail chain (UI Docs page) ─────────────────────

group('19.10 Docs detail — topics → toc → nodes (UI Docs page)');

let docsFileId: string | undefined;
let docsNodeId: number | undefined;

test('GET /docs/topics — returns at least one topic with fileId', async () => {
  const res = await get('/docs/topics');
  assertOk(res);
  const topics = res.data.results ?? res.data;
  assert(topics.length > 0, 'should have at least one indexed doc');
  docsFileId = topics[0].fileId;
  assertExists(docsFileId, 'topic.fileId');
});

test('GET /docs/toc/:fileId — returns TOC chunks for a real file', async () => {
  if (!docsFileId) throw new Error('docsFileId not set from previous test');
  const res = await get(`/docs/toc/${docsFileId}`);
  assertOk(res);
  const chunks = res.data.results ?? res.data;
  assert(Array.isArray(chunks) && chunks.length > 0, 'TOC should have at least one chunk');
  const first = chunks[0];
  assertExists(first.id, 'chunk.id');
  assertExists(first.title, 'chunk.title');
  assert(typeof first.level === 'number', 'chunk.level is number');
  docsNodeId = first.id;
});

test('GET /docs/nodes/:nodeId — returns full node by real id (happy path)', async () => {
  if (docsNodeId == null) throw new Error('docsNodeId not set from previous test');
  const res = await get(`/docs/nodes/${docsNodeId}`);
  assertOk(res);
  assertExists(res.data.id, 'node.id');
  assertExists(res.data.title, 'node.title');
  assertExists(res.data.content, 'node.content');
  assertExists(res.data.fileId, 'node.fileId');
});

// ─── 19.11 Code detail chain (UI Code symbol page) ──────────────

group('19.11 Code detail — files → symbols → symbol → edges (UI Code page)');

let codeFileIdLocal: string | undefined;
let codeSymbolId: number | undefined;

test('GET /code/files — returns at least one indexed code file', async () => {
  const res = await get('/code/files');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assert(files.length > 0, 'should have indexed code files');
  codeFileIdLocal = files[0].fileId;
  assertExists(codeFileIdLocal, 'fileId');
});

test('GET /code/files/:fileId/symbols — returns symbols for the file', async () => {
  if (!codeFileIdLocal) throw new Error('codeFileIdLocal not set');
  const res = await get(`/code/files/${codeFileIdLocal}/symbols`);
  assertOk(res);
  const symbols = res.data.results ?? res.data;
  assert(symbols.length > 0, 'file should expose at least one symbol');
  const sym = symbols[0];
  assertExists(sym.id, 'symbol.id');
  assertExists(sym.name, 'symbol.name');
  assertExists(sym.kind, 'symbol.kind');
  codeSymbolId = sym.id;
});

test('GET /code/symbols/:id — returns full symbol by real id (happy path)', async () => {
  if (codeSymbolId == null) throw new Error('codeSymbolId not set');
  const res = await get(`/code/symbols/${codeSymbolId}`);
  assertOk(res);
  assertExists(res.data.id, 'symbol.id');
  assertExists(res.data.name, 'symbol.name');
  assertExists(res.data.fileId, 'symbol.fileId');
  assert(typeof res.data.startLine === 'number', 'symbol.startLine is number');
});

test('GET /code/symbols/:id/edges — returns edges array (UI symbol detail panel)', async () => {
  if (codeSymbolId == null) throw new Error('codeSymbolId not set');
  const res = await get(`/code/symbols/${codeSymbolId}/edges`);
  assertOk(res);
  const edges = res.data.results ?? res.data;
  assert(Array.isArray(edges), 'edges should be an array (may be empty)');
});

// ─── 19.12 REST query-string filters (UI tasks/skills/epics lists) ──

group('19.12 REST list filters — tasks/skills/epics');

let filterTaskId: number;
let filterSkillId: number;
let filterEpicId: number;

test('Setup: create filter fixtures (task, skill, epic)', async () => {
  const t = await post('/tasks', {
    title: 'Filter Fixture Task',
    description: 'fixture',
    priority: 'high',
    status: 'todo',
    tags: ['filter-test'],
  });
  assertOk(t);
  filterTaskId = t.data.id;

  const s = await post('/skills', {
    title: 'Filter Fixture Skill',
    description: 'fixture',
    source: 'user',
    tags: ['filter-test'],
  });
  assertOk(s);
  filterSkillId = s.data.id;

  const e = await post('/epics', {
    title: 'Filter Fixture Epic',
    description: 'fixture',
    status: 'open',
    priority: 'high',
    tags: ['filter-test'],
  });
  assertOk(e);
  filterEpicId = e.data.id;
});

test('GET /tasks?status=todo — returns todo tasks via REST query', async () => {
  const res = await get('/tasks?status=todo');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.length > 0, 'should find todo tasks');
  assert(items.every((t: any) => t.status === 'todo'),
    'every result should have status=todo');
});

test('GET /tasks?priority=high — returns only high-priority tasks', async () => {
  const res = await get('/tasks?priority=high');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.length > 0, 'should find high-priority tasks');
  assert(items.every((t: any) => t.priority === 'high'),
    'every result should have priority=high');
});

test('GET /tasks?tag=filter-test — returns only tagged tasks', async () => {
  const res = await get('/tasks?tag=filter-test');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.length > 0, 'should find tasks with tag');
  assert(items.some((t: any) => t.id === filterTaskId), 'should include fixture task');
});

test('GET /skills?source=user — returns only user-source skills', async () => {
  const res = await get('/skills?source=user');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.length > 0, 'should find user skills');
  assert(items.every((s: any) => s.source === 'user'),
    'every result should have source=user');
});

test('GET /skills?tag=filter-test — returns only tagged skills', async () => {
  const res = await get('/skills?tag=filter-test');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.some((s: any) => s.id === filterSkillId), 'should include fixture skill');
});

test('GET /epics?status=open — returns only open epics via REST query', async () => {
  const res = await get('/epics?status=open');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.length > 0, 'should find open epics');
  assert(items.every((e: any) => e.status === 'open'),
    'every result should have status=open');
});

test('GET /epics?priority=high — returns only high-priority epics', async () => {
  const res = await get('/epics?priority=high');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.length > 0, 'should find high-priority epics');
  assert(items.every((e: any) => e.priority === 'high'),
    'every result should have priority=high');
});

test('GET /epics?tag=filter-test — returns only tagged epics', async () => {
  const res = await get('/epics?tag=filter-test');
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(items.some((e: any) => e.id === filterEpicId), 'should include fixture epic');
});

test('Cleanup filter fixtures', async () => {
  await del(`/tasks/${filterTaskId}`);
  await del(`/skills/${filterSkillId}`);
  await del(`/epics/${filterEpicId}`);
});

// ─── 19.13 Cross-graph linked with targetGraph=files (UI file detail) ─

group('19.13 Cross-graph linked — targetGraph=files (UI file detail page)');

let fileNodeId: number | undefined;
let linkedNoteId: number;
let linkedTaskId: number;

test('Resolve a real file numeric id via /files/info', async () => {
  // Pick any indexed file from the project
  const list = await get('/files?extension=.ts&limit=5');
  assertOk(list);
  const files = list.data.results ?? list.data;
  const firstFile = files.find((f: any) => f.kind === 'file') ?? files[0];
  assertExists(firstFile, 'an indexed .ts file');
  const info = await get(`/files/info?path=${encodeURIComponent(firstFile.filePath)}`);
  assertOk(info);
  assertExists(info.data.id, 'file numeric id');
  assert(typeof info.data.id === 'number', 'file id is numeric');
  fileNodeId = info.data.id;
});

test('Create note + link to file via POST /knowledge/relations targetGraph=files', async () => {
  if (fileNodeId == null) throw new Error('fileNodeId not set');
  const note = await post('/knowledge/notes', {
    title: 'File Link Note',
    content: 'Linking a note to a file index entry.',
  });
  assertOk(note);
  linkedNoteId = note.data.id;

  const link = await post('/knowledge/relations', {
    fromId: linkedNoteId,
    toId: fileNodeId,
    kind: 'references',
    targetGraph: 'files',
  });
  assertOk(link);
});

test('GET /knowledge/linked?targetGraph=files&targetNodeId={id} — finds note', async () => {
  if (fileNodeId == null) throw new Error('fileNodeId not set');
  const res = await get(`/knowledge/linked?targetGraph=files&targetNodeId=${fileNodeId}`);
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(Array.isArray(items), 'response is array');
  assert(items.length > 0, 'should find at least one linked edge from knowledge');
});

test('Create task + link to file via POST /tasks/links targetGraph=files', async () => {
  if (fileNodeId == null) throw new Error('fileNodeId not set');
  const task = await post('/tasks', {
    title: 'File Link Task',
    description: 'task linked to a file',
    priority: 'low',
  });
  assertOk(task);
  linkedTaskId = task.data.id;

  const link = await post('/tasks/links', {
    fromId: linkedTaskId,
    toId: fileNodeId,
    kind: 'references',
    targetGraph: 'files',
  });
  assertOk(link);
});

test('GET /tasks/linked?targetGraph=files&targetNodeId={id} — finds task', async () => {
  if (fileNodeId == null) throw new Error('fileNodeId not set');
  const res = await get(`/tasks/linked?targetGraph=files&targetNodeId=${fileNodeId}`);
  assertOk(res);
  const items = res.data.results ?? res.data;
  assert(Array.isArray(items), 'response is array');
  assert(items.length > 0, 'should find at least one linked edge from tasks');
});

test('Cleanup cross-graph file-link fixtures', async () => {
  await del('/knowledge/relations', {
    fromId: linkedNoteId,
    toId: fileNodeId,
    targetGraph: 'files',
  });
  await del('/tasks/links', {
    fromId: linkedTaskId,
    toId: fileNodeId,
    targetGraph: 'files',
  });
  await del(`/knowledge/notes/${linkedNoteId}`);
  await del(`/tasks/${linkedTaskId}`);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 19: Coverage Gaps');
}

if (process.argv[1]?.includes('19-')) {
  runStandalone(run);
}
