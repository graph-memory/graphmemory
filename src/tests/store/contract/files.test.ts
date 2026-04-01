import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore } from '@/store';
import { SqliteFilesStore } from '@/store/sqlite/stores/files';

describe('FilesStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let files: SqliteFilesStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    files = new SqliteFilesStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- updateFile ---

  it('adds a new file', () => {
    files.updateFile('src/index.ts', 1024, 1000, seedEmbedding(1));

    const info = files.getFileInfo('src/index.ts');
    expect(info).not.toBeNull();
    expect(info!.kind).toBe('file');
    expect(info!.fileName).toBe('index.ts');
    expect(info!.directory).toBe('src');
    expect(info!.extension).toBe('.ts');
    expect(info!.size).toBe(1024);
    expect(info!.mtime).toBe(1000);
  });

  it('creates parent directory automatically', () => {
    files.updateFile('src/utils/helper.ts', 512, 1000, seedEmbedding(1));

    const dir = files.getFileInfo('src/utils');
    expect(dir).not.toBeNull();
    expect(dir!.kind).toBe('directory');
    expect(dir!.fileName).toBe('utils');
  });

  it('creates full directory chain for deeply nested files', () => {
    files.updateFile('a/b/c/file.ts', 100, 1000, seedEmbedding(1));

    expect(files.getFileInfo('a')).not.toBeNull();
    expect(files.getFileInfo('a')!.kind).toBe('directory');
    expect(files.getFileInfo('a/b')).not.toBeNull();
    expect(files.getFileInfo('a/b')!.kind).toBe('directory');
    expect(files.getFileInfo('a/b/c')).not.toBeNull();
    expect(files.getFileInfo('a/b/c')!.kind).toBe('directory');
  });

  it('updates existing file', () => {
    files.updateFile('src/index.ts', 1024, 1000, seedEmbedding(1));
    files.updateFile('src/index.ts', 2048, 2000, seedEmbedding(2));

    const info = files.getFileInfo('src/index.ts');
    expect(info!.size).toBe(2048);
    expect(info!.mtime).toBe(2000);
  });

  it('updates vec0 on re-index', () => {
    files.updateFile('src/index.ts', 1024, 1000, seedEmbedding(1));
    files.updateFile('src/index.ts', 2048, 2000, seedEmbedding(2));

    // Should have exactly one vec0 row
    const db = store.getDb();
    const count = Number((db.prepare('SELECT COUNT(*) AS c FROM files_vec').get() as { c: bigint }).c);
    expect(count).toBe(1);
  });

  // --- removeFile ---

  it('removes a file', () => {
    files.updateFile('src/index.ts', 1024, 1000, seedEmbedding(1));
    files.removeFile('src/index.ts');

    expect(files.getFileInfo('src/index.ts')).toBeNull();
    expect(files.getFileMtime('src/index.ts')).toBeNull();
  });

  it('cleans up vec0 on remove', () => {
    files.updateFile('src/index.ts', 1024, 1000, seedEmbedding(1));
    files.removeFile('src/index.ts');

    const db = store.getDb();
    const count = Number((db.prepare('SELECT COUNT(*) AS c FROM files_vec').get() as { c: bigint }).c);
    expect(count).toBe(0);
  });

  it('cleans empty parent directories on remove', () => {
    files.updateFile('src/utils/helper.ts', 512, 1000, seedEmbedding(1));
    expect(files.getFileInfo('src/utils')).not.toBeNull();

    files.removeFile('src/utils/helper.ts');
    expect(files.getFileInfo('src/utils')).toBeNull();
  });

  it('keeps non-empty parent directories', () => {
    files.updateFile('src/a.ts', 512, 1000, seedEmbedding(1));
    files.updateFile('src/b.ts', 512, 1000, seedEmbedding(2));

    files.removeFile('src/a.ts');
    // src/ directory should still exist because b.ts is still there
    expect(files.getFileInfo('src')).not.toBeNull();
  });

  it('removeFile is safe for nonexistent files', () => {
    expect(() => files.removeFile('nonexistent.ts')).not.toThrow();
  });

  // --- getFileMtime ---

  it('getFileMtime returns mtime', () => {
    files.updateFile('src/index.ts', 1024, 1000, seedEmbedding(1));
    expect(files.getFileMtime('src/index.ts')).toBe(1000);
  });

  it('getFileMtime returns null for missing file', () => {
    expect(files.getFileMtime('nonexistent.ts')).toBeNull();
  });

  // --- listFiles ---

  it('listFiles returns all entries', () => {
    files.updateFile('src/a.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('src/b.ts', 200, 1000, seedEmbedding(2));

    const result = files.listFiles();
    expect(result.total).toBeGreaterThanOrEqual(2); // includes directory
  });

  it('listFiles filters by directory', () => {
    files.updateFile('src/a.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('lib/b.ts', 200, 1000, seedEmbedding(2));

    const result = files.listFiles({ directory: 'src' });
    expect(result.results.every(f => f.directory === 'src')).toBe(true);
  });

  it('listFiles filters by extension', () => {
    files.updateFile('src/a.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('src/b.js', 200, 1000, seedEmbedding(2));

    const result = files.listFiles({ extension: '.ts' });
    expect(result.results.filter(f => f.kind === 'file').every(f => f.extension === '.ts')).toBe(true);
  });

  it('listFiles filters by text', () => {
    files.updateFile('src/utils.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('src/index.ts', 200, 1000, seedEmbedding(2));

    const result = files.listFiles({ filter: 'utils' });
    expect(result.results.some(f => f.filePath === 'src/utils.ts')).toBe(true);
    expect(result.results.every(f => f.filePath.includes('utils'))).toBe(true);
  });

  it('listFiles with pagination', () => {
    files.updateFile('a.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('b.ts', 200, 1000, seedEmbedding(2));
    files.updateFile('c.ts', 300, 1000, seedEmbedding(3));

    const page = files.listFiles({ limit: 2 });
    expect(page.results.length).toBe(2);
    expect(page.total).toBe(3);
  });

  // --- search ---

  it('searches by keyword (LIKE fallback)', () => {
    files.updateFile('src/utils.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('src/index.ts', 200, 1000, seedEmbedding(2));

    const results = files.search({ text: 'utils', searchMode: 'keyword' });
    expect(results.length).toBe(1);
  });

  it('searches by vector', () => {
    files.updateFile('src/a.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('src/b.ts', 200, 1000, seedEmbedding(2));

    const results = files.search({ embedding: seedEmbedding(1), searchMode: 'vector' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('hybrid search combines LIKE + vector', () => {
    files.updateFile('src/utils.ts', 100, 1000, seedEmbedding(1));
    files.updateFile('src/index.ts', 200, 1000, seedEmbedding(2));

    const results = files.search({ text: 'utils', embedding: seedEmbedding(1), searchMode: 'hybrid' });
    expect(results.length).toBeGreaterThan(0);
  });

  // --- Meta ---

  it('meta is prefixed', () => {
    files.setMeta('lastScan', '999');
    expect(files.getMeta('lastScan')).toBe('999');
    expect(store.getMeta('lastScan')).toBeNull();
  });

  // --- Project isolation ---

  it('projects are isolated', () => {
    files.updateFile('src/a.ts', 100, 1000, seedEmbedding(1));

    const project2 = store.projects.create({ slug: 'other', name: 'Other', directory: '/other' });
    const files2 = new SqliteFilesStore(store.getDb(), project2.id);

    expect(files2.listFiles().total).toBe(0);
    expect(files2.getFileInfo('src/a.ts')).toBeNull();
  });
});
