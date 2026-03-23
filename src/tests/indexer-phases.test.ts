/**
 * Tests for three-phase indexing:
 * - scan(phase) dispatches only to the matching queue
 * - drain(phase) waits only for the matching queue (no finalize)
 * - drain() without phase does full finalize
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProjectIndexer, type IndexPhase } from '@/cli/indexer';
import { createGraph, type DocGraph } from '@/graphs/docs';
import { createFileIndexGraph, type FileIndexGraph } from '@/graphs/file-index-types';

// Stub embed/embedBatch so indexing doesn't need a real model
jest.mock('@/lib/embedder', () => ({
  embed: jest.fn().mockResolvedValue(new Array(32).fill(0)),
  embedBatch: jest.fn().mockImplementation((inputs: unknown[]) =>
    Promise.resolve(inputs.map(() => new Array(32).fill(0)))
  ),
}));

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-phase-'));
  // Create docs and misc files (no code — tree-sitter WASM unavailable in tests)
  fs.writeFileSync(path.join(dir, 'readme.md'), '# Hello\nContent\n');
  fs.writeFileSync(path.join(dir, 'data.json'), '{"key": "value"}\n');
  return dir;
}

function makeIndexer(projectDir: string, docGraph: DocGraph, fileIndexGraph: FileIndexGraph) {
  return createProjectIndexer(docGraph, undefined, {
    projectDir,
    docsInclude: '**/*.md',
    docsExclude: [],
    codeExclude: [],
    filesExclude: [],
    chunkDepth: 4,
  }, undefined, fileIndexGraph);
}

describe('three-phase scan/drain', () => {
  let projectDir: string;
  let docGraph: DocGraph;
  let fileIndexGraph: FileIndexGraph;

  beforeEach(() => {
    projectDir = makeTmpProject();
    docGraph = createGraph();
    fileIndexGraph = createFileIndexGraph();
  });

  afterEach(() => { fs.rmSync(projectDir, { recursive: true, force: true }); });

  it('scan("docs") only indexes markdown files', async () => {
    const indexer = makeIndexer(projectDir, docGraph, fileIndexGraph);
    indexer.scan('docs');
    await indexer.drain('docs');

    expect(docGraph.order).toBeGreaterThan(0);
    expect(fileIndexGraph.order).toBe(0);
  });

  it('scan("files") only indexes file entries', async () => {
    const indexer = makeIndexer(projectDir, docGraph, fileIndexGraph);
    indexer.scan('files');
    await indexer.drain('files');

    expect(docGraph.order).toBe(0);
    expect(fileIndexGraph.order).toBeGreaterThan(0);
  });

  it('sequential phases docs → files index everything', async () => {
    const indexer = makeIndexer(projectDir, docGraph, fileIndexGraph);

    for (const phase of ['docs', 'files'] as IndexPhase[]) {
      indexer.scan(phase);
      await indexer.drain(phase);
    }
    // Finalize
    await indexer.drain();

    expect(docGraph.order).toBeGreaterThan(0);
    expect(fileIndexGraph.order).toBeGreaterThan(0);
  });

  it('scan() without phase dispatches to all queues (backward compat)', async () => {
    const indexer = makeIndexer(projectDir, docGraph, fileIndexGraph);
    indexer.scan();
    await indexer.drain();

    expect(docGraph.order).toBeGreaterThan(0);
    expect(fileIndexGraph.order).toBeGreaterThan(0);
  });

  it('drain("docs") does not perform finalize', async () => {
    // Create two md files with wiki links between them
    fs.writeFileSync(path.join(projectDir, 'a.md'), '# A\nSee [[b]]\n');
    fs.writeFileSync(path.join(projectDir, 'b.md'), '# B\nContent\n');

    const indexer = makeIndexer(projectDir, docGraph, fileIndexGraph);
    indexer.scan('docs');
    await indexer.drain('docs');

    // Nodes should exist but cross-file edges may not be resolved yet
    expect(docGraph.hasNode('a.md')).toBe(true);
    expect(docGraph.hasNode('b.md')).toBe(true);

    // Full drain with finalize resolves deferred edges
    await indexer.drain();
  });
});
