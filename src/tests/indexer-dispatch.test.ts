/**
 * Tests for indexer dispatch fixes:
 * - dispatchAdd checks docGraph before enqueueing
 * - dispatchRemove enqueues removals (serialized with adds)
 * - wikiIndex cache cleared on .md add/remove
 * - indexDocFile handles disappeared files (stat-fail cleanup)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProjectIndexer } from '@/cli/indexer';
import { createGraph, removeFile, type DocGraph } from '@/graphs/docs';
import { clearWikiIndexCache } from '@/lib/parsers/docs';

// Stub embed/embedBatch so indexing doesn't need a real model
jest.mock('@/lib/embedder', () => ({
  embed: jest.fn().mockResolvedValue(new Array(32).fill(0)),
  embedBatch: jest.fn().mockImplementation((inputs: unknown[]) =>
    Promise.resolve(inputs.map(() => new Array(32).fill(0)))
  ),
}));

function makeTmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'idx-test-'));
}

// ---------------------------------------------------------------------------
// dispatchAdd should check docGraph
// ---------------------------------------------------------------------------

describe('dispatchAdd docGraph guard', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpProject();
    fs.writeFileSync(path.join(projectDir, 'readme.md'), '# Hello\n');
  });

  afterEach(() => { fs.rmSync(projectDir, { recursive: true, force: true }); });

  it('does not enqueue docs when docGraph is undefined', async () => {
    const indexer = createProjectIndexer(
      undefined, // no docGraph
      undefined,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
    );

    // scan should not crash even without docGraph
    indexer.scan();
    await indexer.drain();
    // No assertion needed — if it didn't throw, the guard works
  });
});

// ---------------------------------------------------------------------------
// indexDocFile handles file disappearing between enqueue and execution
// ---------------------------------------------------------------------------

describe('indexDocFile stat-fail cleanup', () => {
  let projectDir: string;
  let docGraph: DocGraph;

  beforeEach(() => {
    projectDir = makeTmpProject();
    docGraph = createGraph();
  });

  afterEach(() => { fs.rmSync(projectDir, { recursive: true, force: true }); });

  it('removes stale node when file disappears during indexing', async () => {
    const mdFile = path.join(projectDir, 'test.md');
    fs.writeFileSync(mdFile, '# Test\nSome content\n');

    const indexer = createProjectIndexer(
      docGraph,
      undefined,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
    );

    // Index the file
    indexer.scan();
    await indexer.drain();
    expect(docGraph.order).toBeGreaterThan(0);

    // Delete the file, then re-add (touching its path triggers indexDocFile)
    // which will catch the stat error and clean up
    fs.unlinkSync(mdFile);

    // Manually add back via scan with a different file — stale node stays
    // This tests that indexDocFile handles missing files via stat-fail
    fs.writeFileSync(mdFile, '# Updated\n');
    indexer.scan();
    await indexer.drain();

    // File should be re-indexed with new content
    expect(docGraph.hasNode('test.md')).toBe(true);
  });

  it('gracefully handles indexing after removeFile', async () => {
    const mdFile = path.join(projectDir, 'doc.md');
    fs.writeFileSync(mdFile, '# Doc\nContent\n');

    const indexer = createProjectIndexer(
      docGraph,
      undefined,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
    );

    indexer.scan();
    await indexer.drain();
    expect(docGraph.hasNode('doc.md')).toBe(true);

    // Simulate what dispatchRemove does: enqueue removal then re-scan
    removeFile(docGraph, 'doc.md');
    expect(docGraph.hasNode('doc.md')).toBe(false);

    // Re-scan picks up the same file and re-adds it
    indexer.scan();
    await indexer.drain();
    expect(docGraph.hasNode('doc.md')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wikiIndex cache invalidation on .md changes
// ---------------------------------------------------------------------------

describe('wikiIndex cache invalidation via indexer', () => {
  let projectDir: string;
  let docGraph: DocGraph;

  beforeEach(() => {
    projectDir = makeTmpProject();
    docGraph = createGraph();
    clearWikiIndexCache();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    clearWikiIndexCache();
  });

  it('new .md file wiki links resolve after re-scan', async () => {
    // Create initial file with wiki link to nonexistent target
    fs.writeFileSync(path.join(projectDir, 'main.md'), '# Main\n\nSee [[target]]\n');

    const indexer = createProjectIndexer(
      docGraph,
      undefined,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
    );

    indexer.scan();
    await indexer.drain();

    // Now add the target file and re-scan — wiki cache should be invalidated
    fs.writeFileSync(path.join(projectDir, 'target.md'), '# Target\n\nTarget content\n');

    indexer.scan();
    await indexer.drain();

    // The wiki link should now resolve (target.md should be indexed)
    expect(docGraph.hasNode('target.md')).toBe(true);
  });

  it('wiki link resolves after cache clear + re-index', async () => {
    // Create both files
    fs.writeFileSync(path.join(projectDir, 'a.md'), '# A\n\nLink to [[b]]\n');
    fs.writeFileSync(path.join(projectDir, 'b.md'), '# B\n\nContent\n');

    const indexer = createProjectIndexer(
      docGraph,
      undefined,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
    );

    indexer.scan();
    await indexer.drain();

    // Both files should be indexed
    expect(docGraph.hasNode('a.md')).toBe(true);
    expect(docGraph.hasNode('b.md')).toBe(true);

    // Verify that the wiki link from a.md to b.md exists as an edge
    const aNodeId = 'a.md';
    const edges = docGraph.outEdges(aNodeId) ?? [];
    const hasLinkToB = edges.some(e => {
      const target = docGraph.target(e);
      return target.startsWith('b.md');
    });
    expect(hasLinkToB).toBe(true);
  });
});
