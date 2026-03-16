import fs from 'fs';
import { createFileIndexGraph } from '@/graphs/file-index-types';
import {
  updateFileEntry, removeFileEntry, getFileEntryMtime, ensureDirectoryChain,
  rebuildDirectoryStats, listAllFiles, getFileInfo,
  saveFileIndexGraph, loadFileIndexGraph,
} from '@/graphs/file-index';
import { getLanguage, getMimeType } from '@/graphs/file-lang';
import { searchFileIndex } from '@/lib/search/file-index';
import { unitVec } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Language / MIME maps
// ---------------------------------------------------------------------------

describe('getLanguage', () => {
  it('returns typescript for .ts', () => {
    expect(getLanguage('.ts')).toBe('typescript');
  });

  it('returns javascript for .js', () => {
    expect(getLanguage('.js')).toBe('javascript');
  });

  it('returns markdown for .md', () => {
    expect(getLanguage('.md')).toBe('markdown');
  });

  it('returns json for .json', () => {
    expect(getLanguage('.json')).toBe('json');
  });

  it('returns null for unknown extension', () => {
    expect(getLanguage('.xyz')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(getLanguage('.TS')).toBe('typescript');
  });
});

describe('getMimeType', () => {
  it('returns text/typescript for .ts', () => {
    expect(getMimeType('.ts')).toBe('text/typescript');
  });

  it('returns image/png for .png', () => {
    expect(getMimeType('.png')).toBe('image/png');
  });

  it('returns application/json for .json', () => {
    expect(getMimeType('.json')).toBe('application/json');
  });

  it('returns null for unknown extension', () => {
    expect(getMimeType('.xyz')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Graph CRUD
// ---------------------------------------------------------------------------

describe('updateFileEntry', () => {
  it('adds a file node', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/lib/config.ts', 1024, 1000, unitVec(0));
    expect(g.hasNode('src/lib/config.ts')).toBe(true);
    expect(g.getNodeAttribute('src/lib/config.ts', 'kind')).toBe('file');
    expect(g.getNodeAttribute('src/lib/config.ts', 'fileName')).toBe('config.ts');
    expect(g.getNodeAttribute('src/lib/config.ts', 'extension')).toBe('.ts');
    expect(g.getNodeAttribute('src/lib/config.ts', 'language')).toBe('typescript');
    expect(g.getNodeAttribute('src/lib/config.ts', 'size')).toBe(1024);
  });

  it('creates directory chain', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/lib/config.ts', 1024, 1000, unitVec(0));
    expect(g.hasNode('.')).toBe(true);
    expect(g.hasNode('src')).toBe(true);
    expect(g.hasNode('src/lib')).toBe(true);
    expect(g.getNodeAttribute('src', 'kind')).toBe('directory');
    expect(g.getNodeAttribute('src/lib', 'kind')).toBe('directory');
  });

  it('creates contains edges', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/lib/config.ts', 1024, 1000, unitVec(0));
    expect(g.hasEdge('.', 'src')).toBe(true);
    expect(g.hasEdge('src', 'src/lib')).toBe(true);
    expect(g.hasEdge('src/lib', 'src/lib/config.ts')).toBe(true);
  });

  it('updates existing file node', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'file.txt', 100, 1000, unitVec(0));
    updateFileEntry(g, 'file.txt', 200, 2000, unitVec(1));
    expect(g.getNodeAttribute('file.txt', 'size')).toBe(200);
    expect(g.getNodeAttribute('file.txt', 'mtime')).toBe(2000);
  });

  it('root-level file has directory "."', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'package.json', 500, 1000, unitVec(0));
    expect(g.getNodeAttribute('package.json', 'directory')).toBe('.');
    expect(g.hasEdge('.', 'package.json')).toBe(true);
  });

  it('does not duplicate directory nodes', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/a.ts', 100, 1000, unitVec(0));
    updateFileEntry(g, 'src/b.ts', 200, 1000, unitVec(1));
    const srcNodes = g.filterNodes((_, a) => a.filePath === 'src');
    expect(srcNodes).toHaveLength(1);
  });
});

describe('removeFileEntry', () => {
  it('removes file node', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/a.ts', 100, 1000, unitVec(0));
    removeFileEntry(g, 'src/a.ts');
    expect(g.hasNode('src/a.ts')).toBe(false);
  });

  it('cleans up empty directory chain', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'deep/nested/file.ts', 100, 1000, unitVec(0));
    removeFileEntry(g, 'deep/nested/file.ts');
    expect(g.hasNode('deep/nested')).toBe(false);
    expect(g.hasNode('deep')).toBe(false);
  });

  it('keeps directory if other children exist', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/a.ts', 100, 1000, unitVec(0));
    updateFileEntry(g, 'src/b.ts', 200, 1000, unitVec(1));
    removeFileEntry(g, 'src/a.ts');
    expect(g.hasNode('src')).toBe(true);
    expect(g.hasNode('src/b.ts')).toBe(true);
  });

  it('no-op for nonexistent file', () => {
    const g = createFileIndexGraph();
    removeFileEntry(g, 'ghost.ts');
    expect(g.order).toBe(0);
  });
});

describe('getFileEntryMtime', () => {
  it('returns mtime for existing file', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'file.ts', 100, 42000, unitVec(0));
    expect(getFileEntryMtime(g, 'file.ts')).toBe(42000);
  });

  it('returns 0 for nonexistent file', () => {
    const g = createFileIndexGraph();
    expect(getFileEntryMtime(g, 'ghost.ts')).toBe(0);
  });
});

describe('ensureDirectoryChain', () => {
  it('creates root node for "."', () => {
    const g = createFileIndexGraph();
    ensureDirectoryChain(g, '.');
    expect(g.hasNode('.')).toBe(true);
    expect(g.getNodeAttribute('.', 'kind')).toBe('directory');
  });

  it('creates nested directories', () => {
    const g = createFileIndexGraph();
    ensureDirectoryChain(g, 'a/b/c');
    expect(g.hasNode('.')).toBe(true);
    expect(g.hasNode('a')).toBe(true);
    expect(g.hasNode('a/b')).toBe(true);
    expect(g.hasNode('a/b/c')).toBe(true);
  });

  it('is idempotent', () => {
    const g = createFileIndexGraph();
    ensureDirectoryChain(g, 'a/b');
    ensureDirectoryChain(g, 'a/b');
    expect(g.filterNodes((_, a) => a.filePath === 'a/b')).toHaveLength(1);
  });
});

describe('rebuildDirectoryStats', () => {
  it('computes fileCount and size for directories', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/a.ts', 100, 1000, unitVec(0));
    updateFileEntry(g, 'src/b.ts', 200, 1000, unitVec(1));
    updateFileEntry(g, 'readme.md', 50, 1000, unitVec(2));
    rebuildDirectoryStats(g);

    expect(g.getNodeAttribute('src', 'fileCount')).toBe(2);
    expect(g.getNodeAttribute('src', 'size')).toBe(300);
    expect(g.getNodeAttribute('.', 'fileCount')).toBe(1); // only direct children files
    expect(g.getNodeAttribute('.', 'size')).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Query: listAllFiles
// ---------------------------------------------------------------------------

describe('listAllFiles', () => {
  const g = createFileIndexGraph();

  beforeAll(() => {
    updateFileEntry(g, 'src/lib/config.ts', 100, 1000, unitVec(0));
    updateFileEntry(g, 'src/lib/docs.ts', 200, 1000, unitVec(1));
    updateFileEntry(g, 'src/index.ts', 50, 1000, unitVec(2));
    updateFileEntry(g, 'package.json', 300, 1000, unitVec(3));
    updateFileEntry(g, 'README.md', 150, 1000, unitVec(4));
    rebuildDirectoryStats(g);
  });

  it('lists all files without directory param', () => {
    const results = listAllFiles(g);
    expect(results.every(r => r.kind === 'file')).toBe(true);
    expect(results).toHaveLength(5);
  });

  it('lists immediate children of root', () => {
    const results = listAllFiles(g, { directory: '.' });
    const names = results.map(r => r.fileName);
    expect(names).toContain('src');
    expect(names).toContain('package.json');
    expect(names).toContain('README.md');
  });

  it('lists immediate children of src', () => {
    const results = listAllFiles(g, { directory: 'src' });
    const names = results.map(r => r.fileName);
    expect(names).toContain('lib');
    expect(names).toContain('index.ts');
  });

  it('lists immediate children of src/lib', () => {
    const results = listAllFiles(g, { directory: 'src/lib' });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.kind === 'file')).toBe(true);
  });

  it('filters by extension', () => {
    const results = listAllFiles(g, { extension: '.ts' });
    expect(results).toHaveLength(3);
  });

  it('filters by language', () => {
    const results = listAllFiles(g, { language: 'markdown' });
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('README.md');
  });

  it('filters by substring', () => {
    const results = listAllFiles(g, { filter: 'config' });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/lib/config.ts');
  });

  it('respects limit', () => {
    const results = listAllFiles(g, { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('returns empty for nonexistent directory', () => {
    const results = listAllFiles(g, { directory: 'nonexistent' });
    expect(results).toHaveLength(0);
  });

  it('directory listing includes dirs with stats', () => {
    const results = listAllFiles(g, { directory: '.' });
    const srcEntry = results.find(r => r.filePath === 'src');
    expect(srcEntry).toBeDefined();
    expect(srcEntry!.kind).toBe('directory');
    expect(srcEntry!.fileCount).toBe(1); // src has 1 direct file child (index.ts) + 1 dir (lib)
  });
});

// ---------------------------------------------------------------------------
// Query: getFileInfo
// ---------------------------------------------------------------------------

describe('getFileInfo', () => {
  const g = createFileIndexGraph();

  beforeAll(() => {
    updateFileEntry(g, 'src/config.ts', 1024, 42000, unitVec(0));
    rebuildDirectoryStats(g);
  });

  it('returns file info', () => {
    const info = getFileInfo(g, 'src/config.ts');
    expect(info).not.toBeNull();
    expect(info!.kind).toBe('file');
    expect(info!.fileName).toBe('config.ts');
    expect(info!.extension).toBe('.ts');
    expect(info!.language).toBe('typescript');
    expect(info!.mimeType).toBe('text/typescript');
    expect(info!.size).toBe(1024);
    expect(info!.mtime).toBe(42000);
  });

  it('returns directory info', () => {
    const info = getFileInfo(g, 'src');
    expect(info).not.toBeNull();
    expect(info!.kind).toBe('directory');
    expect(info!.fileCount).toBe(1);
  });

  it('returns null for nonexistent', () => {
    expect(getFileInfo(g, 'ghost.ts')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('searchFileIndex', () => {
  const g = createFileIndexGraph();

  beforeAll(() => {
    updateFileEntry(g, 'src/config.ts', 100, 1000, unitVec(0));
    updateFileEntry(g, 'src/docs.ts', 200, 1000, unitVec(1));
    updateFileEntry(g, 'readme.md', 300, 1000, unitVec(2));
  });

  it('finds file by matching embedding', () => {
    const results = searchFileIndex(g, unitVec(0), { topK: 10, minScore: 0.5 });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('src/config.ts');
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('does not return directories', () => {
    const results = searchFileIndex(g, unitVec(0), { topK: 10, minScore: 0 });
    expect(results.every(r => !['src', '.'].includes(r.filePath))).toBe(true);
  });

  it('respects minScore', () => {
    const results = searchFileIndex(g, unitVec(5), { topK: 10, minScore: 0.5 });
    expect(results).toHaveLength(0);
  });

  it('respects topK', () => {
    const results = searchFileIndex(g, unitVec(0), { topK: 1, minScore: 0 });
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('persistence', () => {
  const STORE = '/tmp/file-index-graph-test';

  afterEach(() => {
    if (fs.existsSync(STORE)) fs.rmSync(STORE, { recursive: true });
  });

  it('save and load preserves nodes and edges', () => {
    const g = createFileIndexGraph();
    updateFileEntry(g, 'src/a.ts', 100, 1000, unitVec(0));
    updateFileEntry(g, 'src/b.ts', 200, 1000, unitVec(1));
    rebuildDirectoryStats(g);
    saveFileIndexGraph(g, STORE);

    const loaded = loadFileIndexGraph(STORE);
    expect(loaded.order).toBe(g.order);
    expect(loaded.size).toBe(g.size);
    expect(loaded.getNodeAttribute('src/a.ts', 'size')).toBe(100);
    expect(loaded.hasEdge('src', 'src/a.ts')).toBe(true);
  });

  it('loadFileIndexGraph with no file returns empty', () => {
    const g = loadFileIndexGraph(STORE + '/nonexistent');
    expect(g.order).toBe(0);
  });
});
