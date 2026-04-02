// Jest integration test for MCP file index tools.
// Exercises files_list, files_search, files_get_info.
// Uses SQLite Store (no Graphology FileIndexGraph).

import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, jsonList, unitVec,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';
import type { FileNode, SearchResult } from '@/store/types';

// ---------------------------------------------------------------------------
// Types (tool output shapes — stripped of internal fields)
// ---------------------------------------------------------------------------

type FileListEntry = {
  filePath: string;
  kind: 'file' | 'directory';
  fileName: string;
  directory: string;
  extension: string;
  language: string | null;
  size: number;
};

type FileInfoResult = Omit<FileNode, 'mimeType' | 'id'>;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const QUERY_AXES: Array<[string, number]> = [
  ['config', 0],
  ['readme', 4],
  ['typescript', 5],
];

const fakeEmbed = createFakeEmbed(QUERY_AXES);

let storeCtx: TestStoreContext;
let ctx: McpTestContext;
let call: McpTestContext['call'];

beforeAll(async () => {
  storeCtx = createTestStoreManager(fakeEmbed);
  const scopedStore = storeCtx.store.project(storeCtx.projectId);

  // Populate file index store
  scopedStore.files.updateFile('src/lib/config.ts', 1024, 1000, unitVec(0), { language: 'typescript' });
  scopedStore.files.updateFile('src/lib/docs.ts',   2048, 1000, unitVec(1), { language: 'typescript' });
  scopedStore.files.updateFile('src/index.ts',       512, 1000, unitVec(2), { language: 'typescript' });
  scopedStore.files.updateFile('package.json',        300, 1000, unitVec(3));
  scopedStore.files.updateFile('README.md',           150, 1000, unitVec(4), { language: 'markdown' });

  ctx = await setupMcpClient({
    scopedStore,
    embedFn: fakeEmbed,
  });
  call = ctx.call;
});

afterAll(async () => {
  await ctx.close();
  storeCtx.cleanup();
});

// ---------------------------------------------------------------------------
// files_list
// ---------------------------------------------------------------------------

describe('files_list', () => {
  it('lists all entries without params (files + directories)', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { limit: 100 }));
    // 5 files + 2 auto-created directories (src, src/lib)
    expect(results.length).toBe(7);
    const files = results.filter(r => r.kind === 'file');
    const dirs = results.filter(r => r.kind === 'directory');
    expect(files).toHaveLength(5);
    expect(dirs).toHaveLength(2);
  });

  it('lists root directory children', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { directory: '.' }));
    const names = results.map(r => r.fileName);
    expect(names).toContain('src');
    expect(names).toContain('package.json');
    expect(names).toContain('README.md');
  });

  it('lists src directory children', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { directory: 'src' }));
    const names = results.map(r => r.fileName);
    expect(names).toContain('lib');
    expect(names).toContain('index.ts');
  });

  it('filters by extension', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { extension: '.json' }));
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('package.json');
  });

  it('filters by substring', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { filter: 'config' }));
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/lib/config.ts');
  });

  it('respects limit', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { limit: 2 }));
    expect(results).toHaveLength(2);
  });

  it('returns empty for nonexistent directory', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { directory: 'nonexistent' }));
    expect(results).toHaveLength(0);
  });

  it('directory entries include kind', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { directory: '.' }));
    const srcEntry = results.find(r => r.filePath === 'src');
    expect(srcEntry).toBeDefined();
    expect(srcEntry!.kind).toBe('directory');
  });
});

// ---------------------------------------------------------------------------
// files_search
// ---------------------------------------------------------------------------

describe('files_search', () => {
  it('finds file by semantic query', async () => {
    // RRF scores are much lower than cosine (≈ 0.016), so use minScore: 0
    const results = json<SearchResult[]>(await call('files_search', { query: 'config', minScore: 0 }));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBeDefined();
    expect(typeof results[0].score).toBe('number');
  });

  it('respects minScore', async () => {
    const results = json<SearchResult[]>(await call('files_search', {
      query: 'typescript',
      minScore: 0.9,
    }));
    // unitVec(5) won't match any of our file embeddings (axes 0-4), and RRF scores are too low
    expect(results).toHaveLength(0);
  });

  it('respects limit', async () => {
    const results = json<SearchResult[]>(await call('files_search', {
      query: 'config',
      minScore: 0,
      limit: 1,
    }));
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// files_get_info
// ---------------------------------------------------------------------------

describe('files_get_info', () => {
  it('returns file metadata', async () => {
    const info = json<FileInfoResult>(await call('files_get_info', { filePath: 'src/lib/config.ts' }));
    expect(info.kind).toBe('file');
    expect(info.fileName).toBe('config.ts');
    expect(info.extension).toBe('.ts');
    expect(info.language).toBe('typescript');
    expect('mimeType' in info).toBe(false);
    expect(info.size).toBe(1024);
    expect(info.directory).toBe('src/lib');
  });

  it('returns directory metadata', async () => {
    const info = json<FileInfoResult>(await call('files_get_info', { filePath: 'src' }));
    expect(info.kind).toBe('directory');
    expect(info.fileName).toBe('src');
  });

  it('returns error for root directory (no virtual root entry)', async () => {
    // SQLite store does not create a virtual "." directory entry
    const res = await call('files_get_info', { filePath: '.' });
    expect(res.isError).toBe(true);
  });

  it('returns error for nonexistent file', async () => {
    const res = await call('files_get_info', { filePath: 'ghost.ts' });
    expect(res.isError).toBe(true);
  });
});
