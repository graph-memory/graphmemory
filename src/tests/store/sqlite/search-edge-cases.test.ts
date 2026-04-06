import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import sqliteVec from 'sqlite-vec';
import { hybridSearch, SearchConfig } from '@/store/sqlite/lib/search';

const DIM = 4;

function seedEmbedding(seed: number): number[] {
  const v = new Array(DIM).fill(0);
  for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.1);
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  return v.map((x: number) => x / norm);
}

function embeddingBuf(seed: number): Buffer {
  return Buffer.from(new Float32Array(seedEmbedding(seed)).buffer);
}

describe('hybridSearch edge cases', () => {
  let db: Database.Database;
  let dir: string;
  const config: SearchConfig = {
    ftsTable: 'test_fts',
    vecTable: 'test_vec',
    parentTable: 'test_items',
    parentIdColumn: 'id',
  };
  const projectId = 1;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'search-edge-'));
    db = new Database(join(dir, 'test.db'));
    db.defaultSafeIntegers(true);
    sqliteVec.load(db);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE test_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE test_fts USING fts5(
        title, content, content=test_items, content_rowid=id
      );
      CREATE TRIGGER test_ai AFTER INSERT ON test_items BEGIN
        INSERT INTO test_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END;
      CREATE VIRTUAL TABLE test_vec USING vec0(embedding float[${DIM}]);
    `);

    const insItem = db.prepare('INSERT INTO test_items (project_id, title, content) VALUES (?, ?, ?)');
    const insVec = db.prepare('INSERT INTO test_vec (rowid, embedding) VALUES (?, ?)');

    db.transaction(() => {
      for (let i = 0; i < 5; i++) {
        const r = insItem.run(projectId, `Item ${i}`, `Content for item ${i}`);
        insVec.run(r.lastInsertRowid, embeddingBuf(i + 1));
      }
    })();
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // --- Empty / missing inputs ---

  it('returns empty for empty text keyword search', () => {
    const results = hybridSearch(db, config, { text: '', searchMode: 'keyword' }, projectId);
    expect(results).toEqual([]);
  });

  it('returns empty for whitespace-only text', () => {
    const results = hybridSearch(db, config, { text: '   ', searchMode: 'keyword' }, projectId);
    expect(results).toEqual([]);
  });

  it('returns empty for hybrid with no text and no embedding', () => {
    const results = hybridSearch(db, config, { searchMode: 'hybrid' }, projectId);
    expect(results).toEqual([]);
  });

  it('returns empty for vector search with no embedding', () => {
    const results = hybridSearch(db, config, { searchMode: 'vector' }, projectId);
    expect(results).toEqual([]);
  });

  // --- minScore boundaries ---

  it('minScore=0 returns all matching results', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(1),
      searchMode: 'vector',
      minScore: 0,
    }, projectId);
    expect(results.length).toBeGreaterThan(0);
  });

  it('minScore=1 returns no results (impossible score for RRF)', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(1),
      searchMode: 'vector',
      minScore: 1,
    }, projectId);
    expect(results.length).toBe(0);
  });

  // --- Special characters in FTS queries ---

  it('handles SQL-like characters in text query', () => {
    // Should not throw or cause SQL injection
    const results = hybridSearch(db, config, {
      text: "'; DROP TABLE test_items; --",
      searchMode: 'keyword',
    }, projectId);
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles FTS5 operator tokens in text query', () => {
    // AND, OR, NOT are FTS5 operators — should be handled gracefully
    const results = hybridSearch(db, config, {
      text: 'AND OR NOT',
      searchMode: 'keyword',
    }, projectId);
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles quotes in text query', () => {
    const results = hybridSearch(db, config, {
      text: '"double" and \'single\'',
      searchMode: 'keyword',
    }, projectId);
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles unicode in text query', () => {
    const results = hybridSearch(db, config, {
      text: 'тестовый запрос 日本語',
      searchMode: 'keyword',
    }, projectId);
    expect(Array.isArray(results)).toBe(true);
  });

  // --- maxResults edge cases ---

  it('maxResults=0 returns empty', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(1),
      searchMode: 'vector',
      maxResults: 0,
    }, projectId);
    expect(results).toEqual([]);
  });

  it('maxResults=1 returns exactly one', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(1),
      searchMode: 'vector',
      maxResults: 1,
    }, projectId);
    expect(results.length).toBe(1);
  });

  // --- SQL injection via table identifiers ---

  it('rejects invalid vecTable identifier', () => {
    expect(() => hybridSearch(db, {
      ...config,
      vecTable: 'test; DROP TABLE x',
    }, { embedding: seedEmbedding(1), searchMode: 'vector' }, projectId)).toThrow('Invalid');
  });

  it('rejects invalid parentTable identifier', () => {
    expect(() => hybridSearch(db, {
      ...config,
      parentTable: 'test; DROP TABLE x',
    }, { text: 'hello', searchMode: 'keyword' }, projectId)).toThrow('Invalid');
  });

  // --- Result consistency ---

  it('keyword search scores are always positive', () => {
    const results = hybridSearch(db, config, {
      text: 'Item Content',
      searchMode: 'keyword',
    }, projectId);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('results are sorted by score descending', () => {
    const results = hybridSearch(db, config, {
      text: 'Item',
      searchMode: 'keyword',
    }, projectId);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
