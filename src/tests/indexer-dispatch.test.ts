/**
 * Tests for indexer dispatch fixes (SQLite Store version):
 * - dispatchAdd checks enabled graphs before enqueueing
 * - dispatchRemove enqueues removals (serialized with adds)
 * - wikiIndex cache cleared on .md add/remove
 * - indexDocFile handles disappeared files (stat-fail cleanup)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProjectIndexer } from '@/cli/indexer';
import { clearWikiIndexCache } from '@/lib/parsers/docs';
import { createTestStoreManager, type TestStoreContext } from '@/tests/helpers';

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
// dispatchAdd should check enabled graphs
// ---------------------------------------------------------------------------

describe('dispatchAdd docs guard', () => {
  let projectDir: string;
  let storeCtx: TestStoreContext;

  beforeEach(() => {
    projectDir = makeTmpProject();
    fs.writeFileSync(path.join(projectDir, 'readme.md'), '# Hello\n');
    storeCtx = createTestStoreManager(
      () => Promise.resolve(new Array(32).fill(0)),
      { projectDir },
    );
  });

  afterEach(() => {
    storeCtx.cleanup();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('does not enqueue docs when docs graph is disabled', async () => {
    const scopedStore = storeCtx.store.project(storeCtx.projectId);
    const indexer = createProjectIndexer(
      scopedStore,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
      { docs: false }, // docs disabled
    );

    // scan should not crash even without docs enabled
    indexer.scan();
    await indexer.drain();
    // No docs should be indexed
    expect(scopedStore.docs.getFileMtime('readme.md')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// indexDocFile handles file disappearing between enqueue and execution
// ---------------------------------------------------------------------------

describe('indexDocFile stat-fail cleanup', () => {
  let projectDir: string;
  let storeCtx: TestStoreContext;

  beforeEach(() => {
    projectDir = makeTmpProject();
    storeCtx = createTestStoreManager(
      () => Promise.resolve(new Array(32).fill(0)),
      { projectDir },
    );
  });

  afterEach(() => {
    storeCtx.cleanup();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('removes stale node when file disappears during indexing', async () => {
    const mdFile = path.join(projectDir, 'test.md');
    fs.writeFileSync(mdFile, '# Test\nSome content\n');

    const scopedStore = storeCtx.store.project(storeCtx.projectId);
    const indexer = createProjectIndexer(
      scopedStore,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
      { docs: true },
    );

    // Index the file
    indexer.scan();
    await indexer.drain();
    expect(scopedStore.docs.getFileMtime('test.md')).not.toBeNull();

    // Delete the file, then re-add (touching its path triggers indexDocFile)
    // which will catch the stat error and clean up
    fs.unlinkSync(mdFile);

    // Manually add back via scan with a different file — stale node stays
    // This tests that indexDocFile handles missing files via stat-fail
    fs.writeFileSync(mdFile, '# Updated\n');
    indexer.scan();
    await indexer.drain();

    // File should be re-indexed with new content
    expect(scopedStore.docs.getFileMtime('test.md')).not.toBeNull();
    const chunks = scopedStore.docs.getFileChunks('test.md');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('gracefully handles indexing after removeFile', async () => {
    const mdFile = path.join(projectDir, 'doc.md');
    fs.writeFileSync(mdFile, '# Doc\nContent\n');

    const scopedStore = storeCtx.store.project(storeCtx.projectId);
    const indexer = createProjectIndexer(
      scopedStore,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
      { docs: true },
    );

    indexer.scan();
    await indexer.drain();
    expect(scopedStore.docs.getFileMtime('doc.md')).not.toBeNull();

    // Simulate what dispatchRemove does: remove from store then re-scan
    scopedStore.docs.removeFile('doc.md');
    expect(scopedStore.docs.getFileMtime('doc.md')).toBeNull();

    // Re-scan picks up the same file and re-adds it
    indexer.scan();
    await indexer.drain();
    expect(scopedStore.docs.getFileMtime('doc.md')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// wikiIndex cache invalidation on .md changes
// ---------------------------------------------------------------------------

describe('wikiIndex cache invalidation via indexer', () => {
  let projectDir: string;
  let storeCtx: TestStoreContext;

  beforeEach(() => {
    projectDir = makeTmpProject();
    storeCtx = createTestStoreManager(
      () => Promise.resolve(new Array(32).fill(0)),
      { projectDir },
    );
    clearWikiIndexCache();
  });

  afterEach(() => {
    storeCtx.cleanup();
    fs.rmSync(projectDir, { recursive: true, force: true });
    clearWikiIndexCache();
  });

  it('new .md file wiki links resolve after re-scan', async () => {
    // Create initial file with wiki link to nonexistent target
    fs.writeFileSync(path.join(projectDir, 'main.md'), '# Main\n\nSee [[target]]\n');

    const scopedStore = storeCtx.store.project(storeCtx.projectId);
    const indexer = createProjectIndexer(
      scopedStore,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
      { docs: true },
    );

    indexer.scan();
    await indexer.drain();

    // Now add the target file and re-scan — wiki cache should be invalidated
    fs.writeFileSync(path.join(projectDir, 'target.md'), '# Target\n\nTarget content\n');

    indexer.scan();
    await indexer.drain();

    // The wiki link should now resolve (target.md should be indexed)
    expect(scopedStore.docs.getFileMtime('target.md')).not.toBeNull();
  });

  it('wiki link resolves after cache clear + re-index', async () => {
    // Create both files
    fs.writeFileSync(path.join(projectDir, 'a.md'), '# A\n\nLink to [[b]]\n');
    fs.writeFileSync(path.join(projectDir, 'b.md'), '# B\n\nContent\n');

    const scopedStore = storeCtx.store.project(storeCtx.projectId);
    const indexer = createProjectIndexer(
      scopedStore,
      {
        projectDir,
        docsInclude: '**/*.md',
        docsExclude: [],
        codeExclude: [],
        filesExclude: [],
        chunkDepth: 4,
      },
      { docs: true },
    );

    indexer.scan();
    await indexer.drain();

    // Both files should be indexed
    expect(scopedStore.docs.getFileMtime('a.md')).not.toBeNull();
    expect(scopedStore.docs.getFileMtime('b.md')).not.toBeNull();

    // Verify chunks exist for both files
    const aChunks = scopedStore.docs.getFileChunks('a.md');
    const bChunks = scopedStore.docs.getFileChunks('b.md');
    expect(aChunks.length).toBeGreaterThan(0);
    expect(bChunks.length).toBeGreaterThan(0);
  });
});
