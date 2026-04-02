import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import sqliteVec from 'sqlite-vec';
import { hybridSearch, SearchConfig } from '@/store/sqlite/lib/search';

const DIM = 4; // small dimension for tests

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

describe('hybridSearch', () => {
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
    dir = mkdtempSync(join(tmpdir(), 'search-test-'));
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

    // Insert test data
    const insItem = db.prepare('INSERT INTO test_items (project_id, title, content) VALUES (?, ?, ?)');
    const insVec = db.prepare('INSERT INTO test_vec (rowid, embedding) VALUES (?, ?)');

    const items = [
      { title: 'Setup Guide', content: 'How to install and configure the application' },
      { title: 'API Reference', content: 'REST API endpoints for managing tasks' },
      { title: 'Database Schema', content: 'SQLite tables and indexes for storage' },
      { title: 'Testing Strategy', content: 'Unit tests and integration tests' },
      { title: 'Deployment', content: 'How to deploy the server to production' },
    ];

    db.transaction(() => {
      for (let i = 0; i < items.length; i++) {
        const r = insItem.run(projectId, items[i].title, items[i].content);
        insVec.run(r.lastInsertRowid, embeddingBuf(i + 1));
      }
      // Insert item in different project (should not appear in results)
      const r = insItem.run(999, 'Other Project', 'SQLite database setup guide');
      insVec.run(r.lastInsertRowid, embeddingBuf(99));
    })();
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keyword-only search returns FTS5 results', () => {
    const results = hybridSearch(db, config, {
      text: 'database OR SQLite',
      searchMode: 'keyword',
    }, projectId);

    expect(results.length).toBeGreaterThan(0);
    // "Database Schema" should be top result
    expect(results[0].id).toBe(3);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('vector-only search returns nearest neighbors', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(3), // similar to item 3 "Database Schema"
      searchMode: 'vector',
    }, projectId);

    expect(results.length).toBeGreaterThan(0);
    // Exact match should be first
    expect(results[0].id).toBe(3);
  });

  it('hybrid search combines FTS5 and vector', () => {
    const results = hybridSearch(db, config, {
      text: 'database',
      embedding: seedEmbedding(3),
      searchMode: 'hybrid',
    }, projectId);

    expect(results.length).toBeGreaterThan(0);
    // Item 3 should rank high (matches both text and vector)
    expect(results[0].id).toBe(3);
    // Hybrid score should be higher than single-mode
    const keywordResults = hybridSearch(db, config, { text: 'database', searchMode: 'keyword' }, projectId);
    expect(results[0].score).toBeGreaterThan(keywordResults[0].score);
  });

  it('respects maxResults', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(1),
      searchMode: 'vector',
      maxResults: 2,
    }, projectId);

    expect(results.length).toBe(2);
  });

  it('respects minScore', () => {
    const results = hybridSearch(db, config, {
      embedding: seedEmbedding(1),
      searchMode: 'vector',
      minScore: 1, // impossibly high
    }, projectId);

    expect(results.length).toBe(0);
  });

  it('filters by project_id (cross-project isolation)', () => {
    const results = hybridSearch(db, config, {
      text: 'SQLite database setup guide',
      searchMode: 'keyword',
    }, projectId);

    // "Other Project" (project_id=999) should NOT appear
    const ids = results.map(r => r.id);
    expect(ids).not.toContain(6); // id 6 is the other-project item
  });

  it('returns empty for no matches', () => {
    const results = hybridSearch(db, config, {
      text: 'xyznonexistent',
      searchMode: 'keyword',
    }, projectId);

    expect(results).toEqual([]);
  });

  it('hybrid with only text (no embedding) behaves like keyword', () => {
    const hybrid = hybridSearch(db, config, {
      text: 'deploy production',
      searchMode: 'hybrid',
    }, projectId);

    const keyword = hybridSearch(db, config, {
      text: 'deploy production',
      searchMode: 'keyword',
    }, projectId);

    // Same results since no embedding provided
    expect(hybrid.map(r => r.id)).toEqual(keyword.map(r => r.id));
  });

  it('throws on invalid table identifier', () => {
    expect(() => hybridSearch(db, {
      ...config,
      ftsTable: 'test; DROP TABLE test_items',
    }, { text: 'hello', searchMode: 'keyword' }, projectId)).toThrow('Invalid ftsTable');
  });

  it('hybrid with only embedding (no text) behaves like vector', () => {
    const hybrid = hybridSearch(db, config, {
      embedding: seedEmbedding(2),
      searchMode: 'hybrid',
    }, projectId);

    const vector = hybridSearch(db, config, {
      embedding: seedEmbedding(2),
      searchMode: 'vector',
    }, projectId);

    expect(hybrid.map(r => r.id)).toEqual(vector.map(r => r.id));
  });
});
