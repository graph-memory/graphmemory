// Jest integration test for MCP file index tools.
// Exercises list_all_files, search_all_files, get_file_info + cross-graph links to files.

import { createFileIndexGraph } from '@/graphs/file-index-types';
import { updateFileEntry, rebuildDirectoryStats } from '@/graphs/file-index';
import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { createFakeEmbed, setupMcpClient, json, unitVec, type McpTestContext } from '@/tests/helpers';

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
// list_all_files
// ---------------------------------------------------------------------------

describe('list_all_files', () => {
  it('lists all files without params', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files'));
    expect(results.length).toBe(5);
    expect(results.every(r => r.kind === 'file')).toBe(true);
  });

  it('lists root directory children', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { directory: '.' }));
    const names = results.map(r => r.fileName);
    expect(names).toContain('src');
    expect(names).toContain('package.json');
    expect(names).toContain('README.md');
  });

  it('lists src directory children', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { directory: 'src' }));
    const names = results.map(r => r.fileName);
    expect(names).toContain('lib');
    expect(names).toContain('index.ts');
  });

  it('filters by extension', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { extension: '.json' }));
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('package.json');
  });

  it('filters by language', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { language: 'markdown' }));
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('README.md');
  });

  it('filters by substring', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { filter: 'config' }));
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/lib/config.ts');
  });

  it('respects limit', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { limit: 2 }));
    expect(results).toHaveLength(2);
  });

  it('returns empty for nonexistent directory', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { directory: 'nonexistent' }));
    expect(results).toHaveLength(0);
  });

  it('directory entries include kind and fileCount', async () => {
    const results = json<FileListEntry[]>(await call('list_all_files', { directory: '.' }));
    const srcEntry = results.find(r => r.filePath === 'src');
    expect(srcEntry).toBeDefined();
    expect(srcEntry!.kind).toBe('directory');
  });
});

// ---------------------------------------------------------------------------
// search_all_files
// ---------------------------------------------------------------------------

describe('search_all_files', () => {
  it('finds file by semantic query', async () => {
    const results = json<FileSearchResult[]>(await call('search_all_files', { query: 'config' }));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toBe('src/lib/config.ts');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('finds readme by query', async () => {
    const results = json<FileSearchResult[]>(await call('search_all_files', { query: 'readme' }));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toBe('README.md');
  });

  it('respects minScore', async () => {
    const results = json<FileSearchResult[]>(await call('search_all_files', {
      query: 'typescript',
      minScore: 0.9,
    }));
    // unitVec(5) won't match any of our file embeddings (axes 0-4)
    expect(results).toHaveLength(0);
  });

  it('respects topK', async () => {
    const results = json<FileSearchResult[]>(await call('search_all_files', {
      query: 'config',
      topK: 1,
    }));
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// get_file_info
// ---------------------------------------------------------------------------

describe('get_file_info', () => {
  it('returns file metadata', async () => {
    const info = json<FileInfoResult>(await call('get_file_info', { filePath: 'src/lib/config.ts' }));
    expect(info.kind).toBe('file');
    expect(info.fileName).toBe('config.ts');
    expect(info.extension).toBe('.ts');
    expect(info.language).toBe('typescript');
    expect(info.mimeType).toBe('text/typescript');
    expect(info.size).toBe(1024);
    expect(info.directory).toBe('src/lib');
  });

  it('returns directory metadata', async () => {
    const info = json<FileInfoResult>(await call('get_file_info', { filePath: 'src' }));
    expect(info.kind).toBe('directory');
    expect(info.fileName).toBe('src');
  });

  it('returns root directory', async () => {
    const info = json<FileInfoResult>(await call('get_file_info', { filePath: '.' }));
    expect(info.kind).toBe('directory');
  });

  it('returns error for nonexistent file', async () => {
    const res = await call('get_file_info', { filePath: 'ghost.ts' });
    expect(res.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph links: knowledge → files
// ---------------------------------------------------------------------------

describe('cross-graph relation to files', () => {
  const xKnowledgeGraph = createKnowledgeGraph();
  const xFileIndexGraph = createFileIndexGraph();
  const xFakeEmbed = createFakeEmbed([['note', 10]]);
  let xCtx: McpTestContext;
  let xCall: McpTestContext['call'];

  type RelCreateResult = { fromId: string; toId: string; kind: string; targetGraph: string; created: boolean };
  type RelEntry = { fromId: string; toId: string; kind: string; targetGraph?: string };

  beforeAll(async () => {
    // Add file and directory nodes
    updateFileEntry(xFileIndexGraph, 'src/config.ts', 1024, 1000, unitVec(0));
    rebuildDirectoryStats(xFileIndexGraph);

    xCtx = await setupMcpClient({
      knowledgeGraph: xKnowledgeGraph,
      fileIndexGraph: xFileIndexGraph,
      embedFn: xFakeEmbed,
    });
    xCall = xCtx.call;
  });

  afterAll(async () => {
    await xCtx.close();
  });

  let noteId: string;

  it('create a note', async () => {
    const res = json<{ noteId: string }>(await xCall('create_note', {
      title: 'Config note',
      content: 'About config file.',
      tags: ['config'],
    }));
    noteId = res.noteId;
    expect(noteId).toBe('config-note');
  });

  it('create_relation to file node', async () => {
    const res = json<RelCreateResult>(await xCall('create_relation', {
      fromId: noteId,
      toId: 'src/config.ts',
      kind: 'references',
      targetGraph: 'files',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
    expect(res.targetGraph).toBe('files');
  });

  it('create_relation to directory node', async () => {
    const res = json<RelCreateResult>(await xCall('create_relation', {
      fromId: noteId,
      toId: 'src',
      kind: 'part_of',
      targetGraph: 'files',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
    expect(res.targetGraph).toBe('files');
  });

  it('duplicate cross relation returns error', async () => {
    const res = await xCall('create_relation', {
      fromId: noteId,
      toId: 'src/config.ts',
      kind: 'references',
      targetGraph: 'files',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('cross relation to nonexistent target returns error', async () => {
    const res = await xCall('create_relation', {
      fromId: noteId,
      toId: 'nonexistent.ts',
      kind: 'references',
      targetGraph: 'files',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('list_relations shows files cross-graph relations', async () => {
    const rels = json<RelEntry[]>(await xCall('list_relations', { noteId }));
    expect(rels).toHaveLength(2);

    const fileRel = rels.find(r => r.toId === 'src/config.ts');
    expect(fileRel).toBeDefined();
    expect(fileRel!.targetGraph).toBe('files');
    expect(fileRel!.kind).toBe('references');

    const dirRel = rels.find(r => r.toId === 'src');
    expect(dirRel).toBeDefined();
    expect(dirRel!.targetGraph).toBe('files');
    expect(dirRel!.kind).toBe('part_of');
  });

  it('delete_relation with targetGraph files', async () => {
    const res = json<{ fromId: string; toId: string; deleted: boolean }>(
      await xCall('delete_relation', {
        fromId: noteId,
        toId: 'src/config.ts',
        targetGraph: 'files',
        projectId: 'test',
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after delete, only directory relation remains', async () => {
    const rels = json<RelEntry[]>(await xCall('list_relations', { noteId }));
    expect(rels).toHaveLength(1);
    expect(rels[0].toId).toBe('src');
    expect(rels[0].targetGraph).toBe('files');
  });

  it('delete_note cleans up remaining files proxy', async () => {
    const del = json<{ deleted: boolean }>(await xCall('delete_note', { noteId }));
    expect(del.deleted).toBe(true);
    expect(xKnowledgeGraph.order).toBe(0);
  });
});
