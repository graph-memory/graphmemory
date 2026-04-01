import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore } from '@/store';
import { SqliteDocsStore } from '@/store/sqlite/stores/docs';

describe('DocsStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let docs: SqliteDocsStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    docs = new SqliteDocsStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- Helper ---

  function makeChunks() {
    return [
      {
        fileId: 'docs/guide.md', title: 'Getting Started',
        content: 'Welcome to the guide', level: 1,
        symbols: ['setup', 'install'], mtime: 1000,
      },
      {
        fileId: 'docs/guide.md', title: 'Configuration',
        content: 'How to configure the app', level: 2,
        language: 'yaml' as string | undefined,
        symbols: ['config'], mtime: 1000,
      },
    ];
  }

  function makeEmbeddings() {
    const emb = new Map<string, number[]>();
    emb.set('docs/guide.md', seedEmbedding(1));
    emb.set('docs/guide.md#0', seedEmbedding(2));
    emb.set('docs/guide.md#1', seedEmbedding(3));
    return emb;
  }

  // --- updateFile ---

  it('updateFile inserts file node and chunk nodes', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    const files = docs.listFiles();
    expect(files.total).toBe(1);
    expect(files.results[0].fileId).toBe('docs/guide.md');
    expect(files.results[0].chunkCount).toBe(2);

    const chunks = docs.getFileChunks('docs/guide.md');
    expect(chunks.length).toBe(2);
    expect(chunks[0].title).toBe('Getting Started');
  });

  it('updateFile creates contains edges', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    const db = store.getDb();
    const edges = db.prepare(
      "SELECT * FROM edges WHERE project_id = ? AND from_graph = 'docs' AND kind = 'contains'"
    ).all(projectId);
    expect(edges.length).toBe(2);
  });

  it('re-updateFile replaces cleanly', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    expect(docs.getFileChunks('docs/guide.md').length).toBe(2);

    // Re-index with one chunk
    const chunks = [makeChunks()[0]];
    const emb = new Map<string, number[]>();
    emb.set('docs/guide.md', seedEmbedding(1));
    emb.set('docs/guide.md#0', seedEmbedding(2));
    docs.updateFile('docs/guide.md', chunks, 2000, emb);

    expect(docs.getFileChunks('docs/guide.md').length).toBe(1);
    expect(docs.listFiles().results[0].mtime).toBe(2000);
  });

  // --- removeFile ---

  it('removeFile cleans everything', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    docs.removeFile('docs/guide.md');

    expect(docs.listFiles().total).toBe(0);
    expect(docs.getFileChunks('docs/guide.md').length).toBe(0);

    const db = store.getDb();
    const vecCount = Number((db.prepare('SELECT COUNT(*) AS c FROM docs_vec').get() as { c: bigint }).c);
    expect(vecCount).toBe(0);
  });

  // --- getFileMtime ---

  it('getFileMtime returns mtime', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    expect(docs.getFileMtime('docs/guide.md')).toBe(1000);
  });

  it('getFileMtime returns null for missing file', () => {
    expect(docs.getFileMtime('nonexistent.md')).toBeNull();
  });

  // --- getNode ---

  it('getNode returns a chunk', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    const chunks = docs.getFileChunks('docs/guide.md');
    const node = docs.getNode(chunks[0].id);
    expect(node).not.toBeNull();
    expect(node!.kind).toBe('chunk');
    expect(node!.title).toBe('Getting Started');
    expect(node!.symbols).toEqual(['setup', 'install']);
  });

  it('getNode returns null for missing id', () => {
    expect(docs.getNode(999)).toBeNull();
  });

  // --- resolveLinks ---

  it('resolveLinks creates cross-file edges', () => {
    docs.updateFile('docs/a.md', [{ fileId: 'docs/a.md', title: 'A', content: '', level: 1, symbols: [], mtime: 1000 }], 1000,
      new Map([['docs/a.md', seedEmbedding(1)], ['docs/a.md#0', seedEmbedding(2)]]));
    docs.updateFile('docs/b.md', [{ fileId: 'docs/b.md', title: 'B', content: '', level: 1, symbols: [], mtime: 1000 }], 1000,
      new Map([['docs/b.md', seedEmbedding(3)], ['docs/b.md#0', seedEmbedding(4)]]));

    docs.resolveLinks([{ fromFileId: 'docs/a.md', toFileId: 'docs/b.md' }]);

    const db = store.getDb();
    const refEdges = db.prepare(
      "SELECT * FROM edges WHERE project_id = ? AND kind = 'references'"
    ).all(projectId);
    expect(refEdges.length).toBe(1);
  });

  // --- listFiles ---

  it('listFiles with filter', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    docs.updateFile('docs/api.md', [{ fileId: 'docs/api.md', title: 'API', content: 'API docs', level: 1, symbols: [], mtime: 1000 }], 1000,
      new Map([['docs/api.md', seedEmbedding(10)], ['docs/api.md#0', seedEmbedding(11)]]));

    const result = docs.listFiles('guide');
    expect(result.total).toBe(1);
    expect(result.results[0].fileId).toBe('docs/guide.md');
  });

  it('listFiles with pagination', () => {
    docs.updateFile('docs/a.md', [], 1000, new Map([['docs/a.md', seedEmbedding(1)]]));
    docs.updateFile('docs/b.md', [], 1000, new Map([['docs/b.md', seedEmbedding(2)]]));
    docs.updateFile('docs/c.md', [], 1000, new Map([['docs/c.md', seedEmbedding(3)]]));

    const page = docs.listFiles(undefined, { limit: 2 });
    expect(page.results.length).toBe(2);
    expect(page.total).toBe(3);
  });

  // --- listSnippets ---

  it('listSnippets returns chunks with language', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    const snippets = docs.listSnippets();
    expect(snippets.total).toBe(1);
    expect(snippets.results[0].language).toBe('yaml');
  });

  it('listSnippets filters by language', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    expect(docs.listSnippets('yaml').total).toBe(1);
    expect(docs.listSnippets('python').total).toBe(0);
  });

  // --- findBySymbol ---

  it('findBySymbol finds chunks by symbol', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    const results = docs.findBySymbol('config');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Configuration');
  });

  it('findBySymbol returns empty for unknown symbol', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    expect(docs.findBySymbol('nonexistent').length).toBe(0);
  });

  // --- search ---

  it('searches by keyword', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    const results = docs.search({ text: 'guide', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('searches by vector', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    const results = docs.search({ embedding: seedEmbedding(2), searchMode: 'vector' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- searchFiles ---

  it('searchFiles returns only file nodes', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    const results = docs.searchFiles({ text: 'guide', searchMode: 'keyword' });
    for (const r of results) {
      const node = docs.getNode(r.id);
      expect(node!.kind).toBe('file');
    }
  });

  // --- searchSnippets ---

  it('searchSnippets returns only snippet chunks', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());
    const results = docs.searchSnippets({ text: 'configure', searchMode: 'keyword' });
    for (const r of results) {
      const node = docs.getNode(r.id);
      expect(node!.language).toBeDefined();
    }
  });

  it('searchSnippets filters by language', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    const yaml = docs.searchSnippets({ text: 'configure', searchMode: 'keyword' }, 'yaml');
    const python = docs.searchSnippets({ text: 'configure', searchMode: 'keyword' }, 'python');

    // yaml snippet matches, python does not
    for (const r of yaml) {
      const node = docs.getNode(r.id);
      expect(node!.language).toBe('yaml');
    }
    expect(python.length).toBe(0);
  });

  // --- Meta ---

  it('meta is prefixed', () => {
    docs.setMeta('lastIndex', '99');
    expect(docs.getMeta('lastIndex')).toBe('99');
    expect(store.getMeta('lastIndex')).toBeNull();
  });

  // --- Project isolation ---

  it('projects are isolated', () => {
    docs.updateFile('docs/guide.md', makeChunks(), 1000, makeEmbeddings());

    const project2 = store.projects.create({ slug: 'other', name: 'Other', directory: '/other' });
    const docs2 = new SqliteDocsStore(store.getDb(), project2.id);

    expect(docs2.listFiles().total).toBe(0);
    expect(docs2.getFileChunks('docs/guide.md').length).toBe(0);
  });
});
