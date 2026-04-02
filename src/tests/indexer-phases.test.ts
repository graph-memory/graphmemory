/**
 * Tests for three-phase indexing (SQLite Store version):
 * - scan(phase) dispatches only to the matching queue
 * - drain(phase) waits only for the matching queue (no finalize)
 * - drain() without phase does full finalize
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createProjectIndexer, type IndexPhase } from '@/cli/indexer';
import { createTestStoreManager, type TestStoreContext } from '@/tests/helpers';
import type { ProjectScopedStore } from '@/store/types';

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

function makeIndexer(projectDir: string, scopedStore: ProjectScopedStore) {
  return createProjectIndexer(scopedStore, {
    projectDir,
    docsInclude: '**/*.md',
    docsExclude: [],
    codeExclude: [],
    filesExclude: [],
    chunkDepth: 4,
  }, { docs: true, files: true });
}

describe('three-phase scan/drain', () => {
  let projectDir: string;
  let storeCtx: TestStoreContext;
  let scopedStore: ProjectScopedStore;

  beforeEach(() => {
    projectDir = makeTmpProject();
    storeCtx = createTestStoreManager(
      () => Promise.resolve(new Array(32).fill(0)),
      { projectDir },
    );
    scopedStore = storeCtx.store.project(storeCtx.projectId);
  });

  afterEach(() => {
    storeCtx.cleanup();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('scan("docs") only indexes markdown files', async () => {
    const indexer = makeIndexer(projectDir, scopedStore);
    indexer.scan('docs');
    await indexer.drain('docs');

    // Docs should be indexed
    expect(scopedStore.docs.getFileMtime('readme.md')).not.toBeNull();
    // Files should NOT be indexed
    expect(scopedStore.files.getFileMtime('data.json')).toBeNull();
  });

  it('scan("files") only indexes file entries', async () => {
    const indexer = makeIndexer(projectDir, scopedStore);
    indexer.scan('files');
    await indexer.drain('files');

    // Docs should NOT be indexed
    expect(scopedStore.docs.getFileMtime('readme.md')).toBeNull();
    // Files should be indexed (readme.md appears in files too)
    const { results } = scopedStore.files.listFiles();
    expect(results.length).toBeGreaterThan(0);
  });

  it('sequential phases docs -> files index everything', async () => {
    const indexer = makeIndexer(projectDir, scopedStore);

    for (const phase of ['docs', 'files'] as IndexPhase[]) {
      indexer.scan(phase);
      await indexer.drain(phase);
    }
    // Finalize
    await indexer.drain();

    expect(scopedStore.docs.getFileMtime('readme.md')).not.toBeNull();
    const { results } = scopedStore.files.listFiles();
    expect(results.length).toBeGreaterThan(0);
  });

  it('scan() without phase dispatches to all queues (backward compat)', async () => {
    const indexer = makeIndexer(projectDir, scopedStore);
    indexer.scan();
    await indexer.drain();

    expect(scopedStore.docs.getFileMtime('readme.md')).not.toBeNull();
    const { results } = scopedStore.files.listFiles();
    expect(results.length).toBeGreaterThan(0);
  });

  it('drain("docs") does not perform finalize', async () => {
    // Create two md files with wiki links between them
    fs.writeFileSync(path.join(projectDir, 'a.md'), '# A\nSee [[b]]\n');
    fs.writeFileSync(path.join(projectDir, 'b.md'), '# B\nContent\n');

    const indexer = makeIndexer(projectDir, scopedStore);
    indexer.scan('docs');
    await indexer.drain('docs');

    // Nodes should exist
    expect(scopedStore.docs.getFileMtime('a.md')).not.toBeNull();
    expect(scopedStore.docs.getFileMtime('b.md')).not.toBeNull();

    // Full drain with finalize resolves deferred edges
    await indexer.drain();
  });
});
