import { createSqliteStoreFactory, seedEmbedding, TEST_DIM } from '../helpers';
import type { SqliteStore } from '@/store';

describe('FTS5 maintenance', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => cleanup());

  it('checkFts returns empty array when all indexes are healthy', () => {
    const failed = store.checkFts();
    expect(failed).toEqual([]);
  });

  it('rebuildFts succeeds on empty database', () => {
    expect(() => store.rebuildFts()).not.toThrow();
  });

  it('rebuildFts succeeds after inserting data', () => {
    const project = store.projects.create({ slug: 'fts-test', name: 'FTS Test', directory: '/tmp/fts' });
    const scoped = store.project(project.id);

    // Insert some knowledge entries
    const emb = seedEmbedding(1, TEST_DIM);
    scoped.knowledge.create({ title: 'Test note', content: 'FTS content here' }, emb);
    scoped.knowledge.create({ title: 'Another note', content: 'More searchable content' }, emb);

    // Rebuild should not throw
    expect(() => store.rebuildFts()).not.toThrow();

    // Search should still work after rebuild
    const results = scoped.knowledge.search({ text: 'searchable', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('checkFts + rebuildFts round-trip', () => {
    const project = store.projects.create({ slug: 'fts-rt', name: 'FTS RT', directory: '/tmp/ftsrt' });
    const scoped = store.project(project.id);
    scoped.knowledge.create({ title: 'Check test', content: 'Integrity check' }, seedEmbedding(1, TEST_DIM));

    // Check should pass
    expect(store.checkFts()).toEqual([]);

    // Rebuild, then check again
    store.rebuildFts();
    expect(store.checkFts()).toEqual([]);
  });
});
