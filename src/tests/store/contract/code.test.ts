import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore } from '@/store';
import { SqliteCodeStore } from '@/store/sqlite/stores/code';

describe('CodeStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let code: SqliteCodeStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    code = new SqliteCodeStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- Helper ---

  function makeNodes() {
    return [
      {
        kind: 'function', fileId: 'src/utils.ts', language: 'typescript',
        name: 'add', signature: 'function add(a: number, b: number): number',
        docComment: 'Adds two numbers', body: 'return a + b;',
        startLine: 1, endLine: 3, isExported: true, mtime: 1000,
      },
      {
        kind: 'function', fileId: 'src/utils.ts', language: 'typescript',
        name: 'subtract', signature: 'function subtract(a: number, b: number): number',
        docComment: 'Subtracts two numbers', body: 'return a - b;',
        startLine: 5, endLine: 7, isExported: true, mtime: 1000,
      },
    ];
  }

  function makeEmbeddings() {
    const emb = new Map<string, number[]>();
    emb.set('src/utils.ts', seedEmbedding(1));
    emb.set('add', seedEmbedding(2));
    emb.set('subtract', seedEmbedding(3));
    return emb;
  }

  // --- updateFile ---

  it('updateFile inserts file node and symbol nodes', () => {
    const nodes = makeNodes();
    code.updateFile('src/utils.ts', nodes, [], 1000, makeEmbeddings());

    const files = code.listFiles();
    expect(files.total).toBe(1);
    expect(files.results[0].fileId).toBe('src/utils.ts');
    expect(files.results[0].symbolCount).toBe(2);

    const symbols = code.getFileSymbols('src/utils.ts');
    expect(symbols.length).toBe(2);
    expect(symbols[0].name).toBe('add');
    expect(symbols[1].name).toBe('subtract');
  });

  it('updateFile creates contains edges', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());

    const db = store.getDb();
    const edges = db.prepare(
      "SELECT * FROM edges WHERE from_project_id = ? AND from_graph = 'code' AND kind = 'contains'"
    ).all(projectId) as Array<Record<string, unknown>>;
    expect(edges.length).toBe(2); // file → add, file → subtract
  });

  it('updateFile creates intra-file edges', () => {
    const edges = [{ fromName: 'add', toName: 'subtract', kind: 'calls' }];
    code.updateFile('src/utils.ts', makeNodes(), edges, 1000, makeEmbeddings());

    const db = store.getDb();
    const callEdges = db.prepare(
      "SELECT * FROM edges WHERE from_project_id = ? AND from_graph = 'code' AND kind = 'calls'"
    ).all(projectId) as Array<Record<string, unknown>>;
    expect(callEdges.length).toBe(1);
  });

  it('re-updateFile replaces cleanly', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    expect(code.getFileSymbols('src/utils.ts').length).toBe(2);

    // Re-index with only one symbol
    const nodes = [makeNodes()[0]];
    const emb = new Map<string, number[]>();
    emb.set('src/utils.ts', seedEmbedding(1));
    emb.set('add', seedEmbedding(2));
    code.updateFile('src/utils.ts', nodes, [], 2000, emb);

    expect(code.getFileSymbols('src/utils.ts').length).toBe(1);
    expect(code.listFiles().results[0].mtime).toBe(2000);
  });

  // --- removeFile ---

  it('removeFile cleans everything', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    code.removeFile('src/utils.ts');

    expect(code.listFiles().total).toBe(0);
    expect(code.getFileSymbols('src/utils.ts').length).toBe(0);

    // Verify vec0 cleaned up via triggers
    const db = store.getDb();
    const vecCount = Number((db.prepare('SELECT COUNT(*) AS c FROM code_vec').get() as { c: bigint }).c);
    expect(vecCount).toBe(0);
  });

  // --- getFileMtime ---

  it('getFileMtime returns mtime for indexed file', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    expect(code.getFileMtime('src/utils.ts')).toBe(1000);
  });

  it('getFileMtime returns null for missing file', () => {
    expect(code.getFileMtime('nonexistent.ts')).toBeNull();
  });

  // --- getNode ---

  it('getNode returns a symbol node', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    const symbols = code.getFileSymbols('src/utils.ts');
    const node = code.getNode(symbols[0].id);
    expect(node).not.toBeNull();
    expect(node!.name).toBe('add');
    expect(node!.isExported).toBe(true);
  });

  it('getNode returns null for missing id', () => {
    expect(code.getNode(999)).toBeNull();
  });

  // --- resolveEdges ---

  it('resolveEdges creates cross-file edges', () => {
    const emb1 = new Map<string, number[]>();
    emb1.set('src/a.ts', seedEmbedding(1));
    emb1.set('greet', seedEmbedding(2));
    code.updateFile('src/a.ts', [{
      kind: 'function', fileId: 'src/a.ts', language: 'typescript',
      name: 'greet', signature: '', docComment: '', body: '',
      startLine: 1, endLine: 2, isExported: true, mtime: 1000,
    }], [], 1000, emb1);

    const emb2 = new Map<string, number[]>();
    emb2.set('src/b.ts', seedEmbedding(3));
    emb2.set('hello', seedEmbedding(4));
    code.updateFile('src/b.ts', [{
      kind: 'function', fileId: 'src/b.ts', language: 'typescript',
      name: 'hello', signature: '', docComment: '', body: '',
      startLine: 1, endLine: 2, isExported: true, mtime: 1000,
    }], [], 1000, emb2);

    code.resolveEdges([{ fromName: 'hello', toName: 'greet', kind: 'imports' }]);

    const db = store.getDb();
    const importEdges = db.prepare(
      "SELECT * FROM edges WHERE from_project_id = ? AND kind = 'imports'"
    ).all(projectId);
    expect(importEdges.length).toBe(1);
  });

  // --- findByName ---

  it('findByName finds symbols by name', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    const results = code.findByName('add');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('add');
  });

  it('findByName excludes file nodes', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    const results = code.findByName('utils.ts');
    expect(results.length).toBe(0);
  });

  // --- listFiles ---

  it('listFiles with filter', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    code.updateFile('src/index.ts', [{
      kind: 'function', fileId: 'src/index.ts', language: 'typescript',
      name: 'main', signature: '', docComment: '', body: '',
      startLine: 1, endLine: 1, isExported: true, mtime: 1000,
    }], [], 1000, new Map([['src/index.ts', seedEmbedding(10)], ['main', seedEmbedding(11)]]));

    const result = code.listFiles('utils');
    expect(result.total).toBe(1);
    expect(result.results[0].fileId).toBe('src/utils.ts');
  });

  it('listFiles with pagination', () => {
    code.updateFile('src/a.ts', [], [], 1000, new Map([['src/a.ts', seedEmbedding(1)]]));
    code.updateFile('src/b.ts', [], [], 1000, new Map([['src/b.ts', seedEmbedding(2)]]));
    code.updateFile('src/c.ts', [], [], 1000, new Map([['src/c.ts', seedEmbedding(3)]]));

    const page = code.listFiles(undefined, { limit: 2 });
    expect(page.results.length).toBe(2);
    expect(page.total).toBe(3);
  });

  // --- search ---

  it('searches by keyword', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    const results = code.search({ text: 'add', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('searches by vector', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    const results = code.search({ embedding: seedEmbedding(2), searchMode: 'vector' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- searchFiles ---

  it('searchFiles returns only file nodes', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());
    // The file node has name 'utils.ts' which is in FTS
    const results = code.searchFiles({ text: 'utils', searchMode: 'keyword' });
    // File nodes should be returned, symbol nodes should be filtered out
    for (const r of results) {
      const node = code.getNode(r.id);
      expect(node!.kind).toBe('file');
    }
  });

  // --- Meta ---

  it('meta is prefixed', () => {
    code.setMeta('lastIndex', '12345');
    expect(code.getMeta('lastIndex')).toBe('12345');
    expect(store.getMeta('lastIndex')).toBeNull();
  });

  // --- Project isolation ---

  it('projects are isolated', () => {
    code.updateFile('src/utils.ts', makeNodes(), [], 1000, makeEmbeddings());

    const project2 = store.projects.create({ slug: 'other', name: 'Other', directory: '/other' });
    const code2 = new SqliteCodeStore(store.getDb(), project2.id);

    expect(code2.listFiles().total).toBe(0);
    expect(code2.getFileSymbols('src/utils.ts').length).toBe(0);
  });
});
