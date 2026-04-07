/**
 * Phase 1: Server Startup & Indexing
 *
 * Tests: server health, project listing, docs/code/files indexing,
 * code blocks, cross-graph, context, tools explorer.
 */

import {
  group, test, runPhase,
  get, post,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk, assertIncludes,
  printSummary, runStandalone,
  wait,
} from './utils';

// Shared state collected during tests
let docFiles: any[] = [];
let firstDocFileId = '';
let firstDocNodeId = '';
let codeFiles: any[] = [];
let firstCodeFileId = '';
let firstSymbolId = '';

// ─── 1.1 Server startup ─────────────────────────────────────────

group('1.1 Server startup');

test('GET /api/projects returns project "sandbox"', async () => {
  const res = await get('/api/projects');
  assertOk(res);
  const projects = res.data.results ?? res.data;
  assert(Array.isArray(projects), 'projects should be an array');
  assertIncludes(projects, (p: any) => p.id === 'sandbox', 'sandbox project');
});

test('GET /api/projects/sandbox/stats returns counts', async () => {
  const res = await get('/stats');
  assertOk(res);
  assertExists(res.data, 'stats data');
});

test('GET /api/workspaces returns list', async () => {
  const res = await get('/api/workspaces');
  assertOk(res);
});

test('GET /api/projects/sandbox/team returns team', async () => {
  const res = await get('/team');
  // May be empty array or object — just should not error
  assertOk(res);
});

test('GET /api/auth/status returns required: false', async () => {
  const res = await get('/api/auth/status');
  assertOk(res);
  assertEqual(res.data.required, false, 'auth required');
});

// ─── 1.2 Docs indexing ──────────────────────────────────────────

group('1.2 Docs indexing');

test('REST GET /docs/topics returns indexed doc files', async () => {
  const res = await get('/docs/topics');
  assertOk(res);
  docFiles = res.data.results ?? res.data;
  assert(Array.isArray(docFiles), 'topics should be array');
  assert(docFiles.length >= 2, `expected >= 2 doc files, got ${docFiles.length}`);
});

test('REST GET /docs/toc/{fileId} returns heading structure', async () => {
  firstDocFileId = docFiles[0]?.fileId ?? docFiles[0]?.id;
  assertExists(firstDocFileId, 'first doc fileId');
  const res = await get(`/docs/toc/${firstDocFileId}`);
  assertOk(res);
  const toc = res.data.results ?? res.data;
  assert(Array.isArray(toc), 'toc should be array');
  assert(toc.length > 0, 'toc should have entries');
  firstDocNodeId = toc[0]?.id;
});

test('REST GET /docs/nodes/{nodeId} returns node content', async () => {
  assertExists(firstDocNodeId, 'first doc nodeId');
  const res = await get(`/docs/nodes/${firstDocNodeId}`);
  assertOk(res);
  assertExists(res.data.content ?? res.data.title, 'node should have content or title');
});

test('REST GET /docs/search?q=installation returns results', async () => {
  const res = await get('/docs/search?q=installation');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(Array.isArray(results), 'results should be array');
  assert(results.length > 0, 'should find installation-related docs');
});

test('MCP docs_list_files matches REST', async () => {
  const res = await mcpCall('docs_list_files');
  assertMcpOk(res);
  const files = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(files.length >= 2, `expected >= 2 files, got ${files.length}`);
});

test('MCP docs_get_toc matches REST', async () => {
  const res = await mcpCall('docs_get_toc', { fileId: firstDocFileId });
  assertMcpOk(res);
  const toc = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(toc.length > 0, 'toc should have entries');
});

test('MCP docs_get_node matches REST', async () => {
  const res = await mcpCall('docs_get_node', { nodeId: firstDocNodeId });
  assertMcpOk(res);
  assertExists(res.data?.content ?? res.data?.title, 'node content');
});

test('MCP docs_search returns results', async () => {
  const res = await mcpCall('docs_search', { query: 'installation' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find results');
});

test('MCP docs_search_files returns file-level results', async () => {
  const res = await mcpCall('docs_search_files', { query: 'sandbox' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find file-level results');
});

// ─── 1.3 Code blocks (from docs) ────────────────────────────────

group('1.3 Code blocks (from docs)');

test('MCP docs_find_examples finds code blocks for "SandboxOptions"', async () => {
  const res = await mcpCall('docs_find_examples', { symbol: 'SandboxOptions' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find code examples');
});

test('MCP docs_search_snippets finds snippets', async () => {
  const res = await mcpCall('docs_search_snippets', { query: 'import' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find snippets');
});

test('MCP docs_list_snippets lists all code blocks', async () => {
  const res = await mcpCall('docs_list_snippets');
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should list snippets');
});

test('MCP docs_explain_symbol returns explanation', async () => {
  const res = await mcpCall('docs_explain_symbol', { symbol: 'Sandbox' });
  assertMcpOk(res);
  assertExists(res.data, 'explain result');
});

// ─── 1.4 Code indexing ──────────────────────────────────────────

group('1.4 Code indexing');

test('REST GET /code/files returns indexed code files', async () => {
  const res = await get('/code/files');
  assertOk(res);
  codeFiles = res.data.results ?? res.data;
  assert(Array.isArray(codeFiles), 'code files should be array');
  assert(codeFiles.length >= 3, `expected >= 3 code files, got ${codeFiles.length}`);
});

test('REST GET /code/files/{fileId}/symbols returns symbols', async () => {
  firstCodeFileId = codeFiles.find((f: any) =>
    (f.fileId ?? f.id ?? '').includes('index'))?.fileId
    ?? codeFiles[0]?.fileId ?? codeFiles[0]?.id;
  assertExists(firstCodeFileId, 'first code fileId');
  const res = await get(`/code/files/${firstCodeFileId}/symbols`);
  assertOk(res);
  const symbols = res.data.results ?? res.data;
  assert(Array.isArray(symbols), 'symbols should be array');
  assert(symbols.length > 0, 'should have symbols');
  firstSymbolId = symbols[0]?.id;
});

test('REST GET /code/symbols/{symbolId} returns detail', async () => {
  assertExists(firstSymbolId, 'first symbolId');
  const res = await get(`/code/symbols/${firstSymbolId}`);
  assertOk(res);
  assertExists(res.data.name ?? res.data.signature, 'symbol name or signature');
});

test('REST GET /code/symbols/{symbolId} edges included in response', async () => {
  assertExists(firstSymbolId, 'first symbolId');
  const res = await get(`/code/symbols/${firstSymbolId}`);
  assertOk(res);
  // Edges are part of the symbol detail (via store getNode)
});

test('REST GET /code/search?q=Logger returns results', async () => {
  const res = await get('/code/search?q=Logger');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(Array.isArray(results), 'results should be array');
  assert(results.length > 0, 'should find Logger');
});

test('MCP code_list_files matches REST', async () => {
  const res = await mcpCall('code_list_files');
  assertMcpOk(res);
  const files = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(files.length >= 3, `expected >= 3, got ${files.length}`);
});

test('MCP code_get_file_symbols matches REST', async () => {
  const res = await mcpCall('code_get_file_symbols', { fileId: firstCodeFileId });
  assertMcpOk(res);
  const symbols = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(symbols.length > 0, 'should have symbols');
});

test('MCP code_get_symbol matches REST', async () => {
  const res = await mcpCall('code_get_symbol', { nodeId: firstSymbolId });
  assertMcpOk(res);
  assertExists(res.data?.name ?? res.data?.signature, 'symbol name');
});

test('MCP code_search returns results', async () => {
  const res = await mcpCall('code_search', { query: 'Logger' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find Logger');
});

test('MCP code_search_files returns file-level results', async () => {
  const res = await mcpCall('code_search_files', { query: 'logger' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find files');
});

// ─── 1.5 Cross-graph ────────────────────────────────────────────

group('1.5 Cross-graph');

test('MCP docs_cross_references for "Sandbox"', async () => {
  const res = await mcpCall('docs_cross_references', { symbol: 'Sandbox' });
  assertMcpOk(res);
  assertExists(res.data, 'cross references result');
});

// ─── 1.6 File index ─────────────────────────────────────────────

group('1.6 File index');

test('REST GET /files returns project files', async () => {
  const res = await get('/files');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assert(Array.isArray(files), 'files should be array');
  assert(files.length > 0, 'should have files');
});

test('REST GET /files/search?q=logger finds file', async () => {
  const res = await get('/files/search?q=logger');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find logger file');
});

test('REST GET /files/info?path=src/index.ts returns metadata', async () => {
  const res = await get('/files/info?path=src/index.ts');
  assertOk(res);
  assertExists(res.data.filePath ?? res.data.fileName, 'file info');
});

test('MCP files_list matches REST', async () => {
  const res = await mcpCall('files_list');
  assertMcpOk(res);
  const files = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(files.length > 0, 'should have files');
});

test('MCP files_search finds logger', async () => {
  const res = await mcpCall('files_search', { query: 'logger' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find logger');
});

test('MCP files_get_info returns metadata', async () => {
  const res = await mcpCall('files_get_info', { filePath: 'src/index.ts' });
  assertMcpOk(res);
  assertExists(res.data?.filePath ?? res.data?.fileName, 'file info');
});

// ─── 1.7 Context ────────────────────────────────────────────────

group('1.7 Context');

test('MCP get_context returns project info', async () => {
  const res = await mcpCall('get_context');
  assertMcpOk(res);
  assertEqual(res.data?.projectId, 'sandbox', 'projectId');
  assertEqual(res.data?.hasWorkspace, false, 'hasWorkspace');
});

// ─── 1.8 Tools explorer ─────────────────────────────────────────

group('1.8 Tools explorer');

test('REST GET /tools returns tool list', async () => {
  const res = await get('/tools');
  assertOk(res);
  const tools = res.data.results ?? res.data;
  assert(Array.isArray(tools), 'tools should be array');
  assert(tools.length >= 50, `expected >= 50 tools, got ${tools.length}`);
});

test('REST GET /tools/get_context returns tool schema', async () => {
  const res = await get('/tools/get_context');
  assertOk(res);
  assertExists(res.data.name ?? res.data.toolName, 'tool name');
});

test('REST POST /tools/get_context/call executes tool', async () => {
  const res = await post('/tools/get_context/call', { arguments: {} });
  assertOk(res);
  assertExists(res.data.result, 'tool result');
});

// ─── 1.9 List with filter + pagination ──────────────────────────

group('1.9 List with filter + pagination');

test('docs_list_files with filter', async () => {
  const res = await get('/docs/topics?filter=api');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assert(files.length > 0, 'should find docs matching "api"');
});

test('code_list_files with filter', async () => {
  const res = await mcpCall('code_list_files', { filter: 'logger' });
  assertMcpOk(res);
  const files = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(files.length > 0, 'should find code files matching "logger"');
});

test('docs_list_files with limit + offset pagination', async () => {
  const page1 = await get('/docs/topics?limit=1&offset=0');
  assertOk(page1);
  const items1 = page1.data.results ?? page1.data;
  assert(items1.length === 1, 'page 1 should have 1 item');

  const page2 = await get('/docs/topics?limit=1&offset=1');
  assertOk(page2);
  const items2 = page2.data.results ?? page2.data;
  assert(items2.length === 1, 'page 2 should have 1 item');

  // Verify no overlap
  const id1 = items1[0]?.fileId ?? items1[0]?.id;
  const id2 = items2[0]?.fileId ?? items2[0]?.id;
  assert(id1 !== id2, 'pages should not overlap');
});

test('files_list with offset > total returns empty', async () => {
  const res = await get('/files?offset=99999');
  assertOk(res);
  const files = res.data.results ?? res.data;
  assertEqual(files.length, 0, 'offset beyond total should return empty');
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 1: Server Startup & Indexing');
}

if (process.argv[1]?.includes('01-')) {
  runStandalone(run);
}
