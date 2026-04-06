import { createSqliteStoreFactory, seedEmbedding, TEST_DIM } from '../helpers';
import type { SqliteStore } from '@/store';

describe('CodeStore edge cases', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'code-test', name: 'Code Test', directory: '/tmp/code' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  it('updateFile with empty nodes creates file node only', () => {
    const scoped = store.project(projectId);
    scoped.code.updateFile('src/empty.ts', [], [], Date.now(), new Map());

    const files = scoped.code.listFiles();
    expect(files.total).toBe(1);
    expect(files.results[0].fileId).toBe('src/empty.ts');
    expect(files.results[0].symbolCount).toBe(0);
  });

  it('updateFile replaces previous file data', () => {
    const scoped = store.project(projectId);
    const emb1 = new Map([['src/file.ts', seedEmbedding(1, TEST_DIM)]]);
    const emb2 = new Map([['src/file.ts', seedEmbedding(2, TEST_DIM)]]);

    scoped.code.updateFile('src/file.ts', [
      { kind: 'function', fileId: 'src/file.ts', language: 'typescript', name: 'oldFn', signature: '', docComment: '', body: '', startLine: 1, endLine: 5, isExported: true, mtime: 100 },
    ], [], 100, emb1);

    scoped.code.updateFile('src/file.ts', [
      { kind: 'function', fileId: 'src/file.ts', language: 'typescript', name: 'newFn', signature: '', docComment: '', body: '', startLine: 1, endLine: 10, isExported: true, mtime: 200 },
    ], [], 200, emb2);

    const symbols = scoped.code.getFileSymbols('src/file.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('newFn');
  });

  it('removeFile cleans up completely', () => {
    const scoped = store.project(projectId);
    scoped.code.updateFile('src/remove-me.ts', [
      { kind: 'function', fileId: 'src/remove-me.ts', language: 'typescript', name: 'fn', signature: '', docComment: '', body: '', startLine: 1, endLine: 1, isExported: false, mtime: 100 },
    ], [], 100, new Map());

    scoped.code.removeFile('src/remove-me.ts');

    expect(scoped.code.getFileMtime('src/remove-me.ts')).toBeNull();
    expect(scoped.code.getFileSymbols('src/remove-me.ts')).toHaveLength(0);
  });

  it('removeFile on non-existent file is no-op', () => {
    const scoped = store.project(projectId);
    // Should not throw
    scoped.code.removeFile('src/nonexistent.ts');
  });

  it('clear removes all code data', () => {
    const scoped = store.project(projectId);
    scoped.code.updateFile('src/a.ts', [], [], 100, new Map());
    scoped.code.updateFile('src/b.ts', [], [], 100, new Map());

    scoped.code.clear();

    expect(scoped.code.listFiles().total).toBe(0);
  });

  it('listFiles with filter', () => {
    const scoped = store.project(projectId);
    scoped.code.updateFile('src/utils/helper.ts', [], [], 100, new Map());
    scoped.code.updateFile('src/api/index.ts', [], [], 100, new Map());
    scoped.code.updateFile('src/api/routes.ts', [], [], 100, new Map());

    const results = scoped.code.listFiles('api');
    expect(results.total).toBe(2);
  });

  it('findByName returns matching symbols', () => {
    const scoped = store.project(projectId);
    scoped.code.updateFile('src/file.ts', [
      { kind: 'function', fileId: 'src/file.ts', language: 'typescript', name: 'myFunction', signature: '', docComment: '', body: '', startLine: 1, endLine: 5, isExported: true, mtime: 100 },
    ], [], 100, new Map());

    const found = scoped.code.findByName('myFunction');
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('myFunction');
  });

  it('findByName returns empty for non-existent name', () => {
    const scoped = store.project(projectId);
    expect(scoped.code.findByName('nonexistent')).toHaveLength(0);
  });
});

describe('DocsStore edge cases', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'docs-test', name: 'Docs Test', directory: '/tmp/docs' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  it('updateFile with empty chunks creates file node only', () => {
    const scoped = store.project(projectId);
    scoped.docs.updateFile('README.md', [], Date.now(), new Map());

    const files = scoped.docs.listFiles();
    expect(files.total).toBe(1);
    expect(files.results[0].fileId).toBe('README.md');
    expect(files.results[0].chunkCount).toBe(0);
  });

  it('updateFile replaces previous file data', () => {
    const scoped = store.project(projectId);

    scoped.docs.updateFile('README.md', [
      { fileId: 'README.md', title: 'Old Title', content: 'Old content', level: 1, symbols: [], mtime: 100 },
    ], 100, new Map());

    scoped.docs.updateFile('README.md', [
      { fileId: 'README.md', title: 'New Title', content: 'New content', level: 1, symbols: [], mtime: 200 },
    ], 200, new Map());

    const chunks = scoped.docs.getFileChunks('README.md');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe('New Title');
  });

  it('removeFile cleans up completely', () => {
    const scoped = store.project(projectId);
    scoped.docs.updateFile('GUIDE.md', [
      { fileId: 'GUIDE.md', title: 'Guide', content: 'c', level: 1, symbols: [], mtime: 100 },
    ], 100, new Map());

    scoped.docs.removeFile('GUIDE.md');

    expect(scoped.docs.getFileMtime('GUIDE.md')).toBeNull();
    expect(scoped.docs.getFileChunks('GUIDE.md')).toHaveLength(0);
  });

  it('removeFile on non-existent file is no-op', () => {
    const scoped = store.project(projectId);
    scoped.docs.removeFile('nonexistent.md');
  });

  it('clear removes all docs data', () => {
    const scoped = store.project(projectId);
    scoped.docs.updateFile('a.md', [], 100, new Map());
    scoped.docs.updateFile('b.md', [], 100, new Map());

    scoped.docs.clear();

    expect(scoped.docs.listFiles().total).toBe(0);
  });

  it('listFiles with filter', () => {
    const scoped = store.project(projectId);
    scoped.docs.updateFile('docs/api.md', [], 100, new Map());
    scoped.docs.updateFile('docs/guide.md', [], 100, new Map());
    scoped.docs.updateFile('README.md', [], 100, new Map());

    const results = scoped.docs.listFiles('docs/');
    expect(results.total).toBe(2);
  });

  it('getNode returns null for non-existent node', () => {
    const scoped = store.project(projectId);
    expect(scoped.docs.getNode(99999)).toBeNull();
  });

  it('chunks store symbols correctly', () => {
    const scoped = store.project(projectId);
    scoped.docs.updateFile('api.md', [
      { fileId: 'api.md', title: 'API', content: 'code', level: 1, symbols: ['myFunc', 'myClass'], mtime: 100 },
    ], 100, new Map());

    const chunks = scoped.docs.getFileChunks('api.md');
    expect(chunks[0].symbols).toEqual(['myFunc', 'myClass']);
  });

  it('findBySymbol returns matching docs', () => {
    const scoped = store.project(projectId);
    scoped.docs.updateFile('api.md', [
      { fileId: 'api.md', title: 'API', content: 'code', level: 1, symbols: ['findMe'], mtime: 100 },
    ], 100, new Map());

    const found = scoped.docs.findBySymbol('findMe');
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe('API');
  });
});

describe('FilesStore edge cases', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'files-test', name: 'Files Test', directory: '/tmp/files' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  it('updateFile creates directory hierarchy', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    scoped.files.updateFile('src/lib/utils/helper.ts', 100, Date.now(), emb);

    const info = scoped.files.getFileInfo('src/lib/utils/helper.ts');
    expect(info).not.toBeNull();
    expect(info!.fileName).toBe('helper.ts');
    expect(info!.directory).toBe('src/lib/utils');
    expect(info!.extension).toBe('.ts');
  });

  it('updateFile updates existing file', () => {
    const scoped = store.project(projectId);
    const emb1 = seedEmbedding(1, TEST_DIM);
    const emb2 = seedEmbedding(2, TEST_DIM);

    scoped.files.updateFile('file.txt', 100, 1000, emb1);
    scoped.files.updateFile('file.txt', 200, 2000, emb2);

    const info = scoped.files.getFileInfo('file.txt');
    expect(info!.size).toBe(200);
    expect(info!.mtime).toBe(2000);
  });

  it('removeFile cleans up empty directories', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    scoped.files.updateFile('src/only-file.ts', 100, Date.now(), emb);
    scoped.files.removeFile('src/only-file.ts');

    // File should be gone
    expect(scoped.files.getFileInfo('src/only-file.ts')).toBeNull();
  });

  it('removeFile on non-existent file is no-op', () => {
    const scoped = store.project(projectId);
    scoped.files.removeFile('nonexistent.txt');
  });

  it('clear removes all files', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    scoped.files.updateFile('a.txt', 10, 100, emb);
    scoped.files.updateFile('b.txt', 20, 200, emb);

    scoped.files.clear();
    expect(scoped.files.listFiles().total).toBe(0);
  });

  it('listFiles with filter', () => {
    const scoped = store.project(projectId);
    const emb = seedEmbedding(1, TEST_DIM);

    scoped.files.updateFile('src/api.ts', 10, 100, emb);
    scoped.files.updateFile('src/util.ts', 10, 100, emb);
    scoped.files.updateFile('test/api.test.ts', 10, 100, emb);

    const results = scoped.files.listFiles({ filter: 'api' });
    expect(results.total).toBe(2);
  });

  it('getFileMtime returns null for non-existent file', () => {
    const scoped = store.project(projectId);
    expect(scoped.files.getFileMtime('nonexistent.txt')).toBeNull();
  });
});
