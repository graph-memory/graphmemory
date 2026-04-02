// Jest integration test for MCP file index tools.
// Exercises files_list, files_search, files_get_info.
// File index still uses Graphology (indexed graph — not yet migrated to SQLite).

import { createFileIndexGraph } from '@/graphs/file-index-types';
import { updateFileEntry, rebuildDirectoryStats } from '@/graphs/file-index';
import { createFakeEmbed, setupMcpClient, json, jsonList, unitVec, type McpTestContext } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileListEntry = {
  filePath: string;
  kind: 'file' | 'directory';
  fileName: string;
  extension: string;
  language: string | null;
  mimeType: string | null;
  size: number;
  fileCount: number;
};

type FileInfoResult = FileListEntry & { directory: string; mtime: number };

type FileSearchResult = {
  filePath: string;
  fileName: string;
  extension: string;
  language: string | null;
  size: number;
  score: number;
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const fileIndexGraph = createFileIndexGraph();

const QUERY_AXES: Array<[string, number]> = [
  ['config', 0],
  ['readme', 4],
  ['typescript', 5],
];

const fakeEmbed = createFakeEmbed(QUERY_AXES);
let ctx: McpTestContext;
let call: McpTestContext['call'];

beforeAll(async () => {
  // Populate file index graph
  updateFileEntry(fileIndexGraph, 'src/lib/config.ts', 1024, 1000, unitVec(0));
  updateFileEntry(fileIndexGraph, 'src/lib/docs.ts', 2048, 1000, unitVec(1));
  updateFileEntry(fileIndexGraph, 'src/index.ts', 512, 1000, unitVec(2));
  updateFileEntry(fileIndexGraph, 'package.json', 300, 1000, unitVec(3));
  updateFileEntry(fileIndexGraph, 'README.md', 150, 1000, unitVec(4));
  rebuildDirectoryStats(fileIndexGraph);

  ctx = await setupMcpClient({
    fileIndexGraph,
    embedFn: fakeEmbed,
  });
  call = ctx.call;
});

afterAll(async () => {
  await ctx.close();
});

// ---------------------------------------------------------------------------
// files_list
// ---------------------------------------------------------------------------

describe('files_list', () => {
  it('lists all files without params', async () => {
    const results = jsonList<FileListEntry>(await call('files_list'));
    expect(results.length).toBe(5);
    expect(results.every(r => r.kind === 'file')).toBe(true);
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

  it('filters by language', async () => {
    const results = jsonList<FileListEntry>(await call('files_list', { language: 'markdown' }));
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('README.md');
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

  it('directory entries include kind and fileCount', async () => {
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
    const results = json<FileSearchResult[]>(await call('files_search', { query: 'config' }));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toBe('src/lib/config.ts');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('finds readme by query', async () => {
    const results = json<FileSearchResult[]>(await call('files_search', { query: 'readme' }));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toBe('README.md');
  });

  it('respects minScore', async () => {
    const results = json<FileSearchResult[]>(await call('files_search', {
      query: 'typescript',
      minScore: 0.9,
    }));
    // unitVec(5) won't match any of our file embeddings (axes 0-4)
    expect(results).toHaveLength(0);
  });

  it('respects limit', async () => {
    const results = json<FileSearchResult[]>(await call('files_search', {
      query: 'config',
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

  it('returns root directory', async () => {
    const info = json<FileInfoResult>(await call('files_get_info', { filePath: '.' }));
    expect(info.kind).toBe('directory');
  });

  it('returns error for nonexistent file', async () => {
    const res = await call('files_get_info', { filePath: 'ghost.ts' });
    expect(res.isError).toBe(true);
  });
});
