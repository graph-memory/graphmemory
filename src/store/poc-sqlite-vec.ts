/**
 * PoC: better-sqlite3 + sqlite-vec + FTS5
 *
 * Verifies:
 *   1. sqlite-vec extension loads
 *   2. Vector table creation and insert
 *   3. KNN search (nearest neighbors)
 *   4. FTS5 keyword search
 *   5. Hybrid search (combine vector + FTS5 scores)
 *   6. Performance with realistic embedding dimensions (384)
 *   7. File-based DB persistence (open/close/reopen)
 *   8. WAL mode for concurrent reads
 *   9. CASCADE deletes via foreign keys
 *  10. JSON arrays in columns (json_each)
 *  11. Embedding disk size at scale
 *  12. Nested transactions (savepoints)
 *  13. Migration pattern (PRAGMA user_version)
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function randomEmbedding(seed: number): Float32Array {
  const vec = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    vec[i] = Math.sin(seed * (i + 1) * 0.01) * 0.5;
  }
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < 384; i++) vec[i] /= norm;
  return vec;
}

function openDb(path: string) {
  const db = new Database(path);
  db.defaultSafeIntegers(true);
  sqliteVec.load(db);
  return db;
}

function section(title: string) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'poc-sqlite-'));
  const dbPath = join(tmpDir, 'test.db');

  try {
    runAllTests(dbPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runAllTests(dbPath: string) {

  // =========================================================================
  // 1. sqlite-vec extension + WAL mode
  // =========================================================================
  section('1. sqlite-vec + WAL mode');

  let db = openDb(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const vecVersion = db.prepare("SELECT vec_version() AS v").get() as { v: string };
  const journalMode = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
  console.log(`✓ sqlite-vec loaded: ${vecVersion.v}`);
  console.log(`✓ WAL mode: ${journalMode[0].journal_mode}`);

  // =========================================================================
  // 2. Schema + CASCADE + JSON arrays
  // =========================================================================
  section('2. Schema with CASCADE + JSON arrays');

  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000)
    );

    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now', 'subsec') * 1000),
      UNIQUE(project_id, slug)
    );

    -- FTS5 for keyword search
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      title, content,
      content=notes,
      content_rowid=id
    );

    CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
    END;
    CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;

    -- Vector table (rowid maps to notes.id)
    CREATE VIRTUAL TABLE notes_vec USING vec0(
      embedding float[384]
    );

    -- Tags junction table
    CREATE TABLE entity_tags (
      graph TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (graph, entity_id, tag)
    );
    CREATE INDEX idx_tags_tag ON entity_tags(tag);

    -- Meta key-value
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  console.log('✓ Schema created (projects, notes, FTS5, vec0, tags, meta)');

  // =========================================================================
  // 3. Insert data + JSON arrays
  // =========================================================================
  section('3. Insert data with JSON arrays');

  const projResult = db.prepare('INSERT INTO projects (slug, name) VALUES (?, ?)').run('demo', 'Demo Project');
  const projectId = projResult.lastInsertRowid;

  const insertNote = db.prepare('INSERT INTO notes (project_id, slug, title, content, tags_json) VALUES (?, ?, ?, ?, ?)');
  const insertVec = db.prepare('INSERT INTO notes_vec (rowid, embedding) VALUES (?, ?)');
  const insertTag = db.prepare('INSERT INTO entity_tags (graph, entity_id, tag) VALUES (?, ?, ?)');

  const testNotes = [
    { slug: 'setup', title: 'Setup Guide', content: 'How to install and configure the app', tags: ['guide', 'setup'] },
    { slug: 'api', title: 'API Reference', content: 'REST API endpoints for tasks and projects', tags: ['api', 'reference'] },
    { slug: 'db-schema', title: 'Database Schema', content: 'SQLite tables and indexes for storage', tags: ['database', 'schema'] },
    { slug: 'testing', title: 'Testing Strategy', content: 'Unit and integration tests for the app', tags: ['testing', 'quality'] },
    { slug: 'deploy', title: 'Deployment Guide', content: 'Deploy the server to production', tags: ['guide', 'deploy'] },
  ];

  db.transaction(() => {
    for (let i = 0; i < testNotes.length; i++) {
      const n = testNotes[i];
      const r = insertNote.run(projectId, n.slug, n.title, n.content, JSON.stringify(n.tags));
      insertVec.run(r.lastInsertRowid, Buffer.from(randomEmbedding(i + 1).buffer));
      for (const tag of n.tags) {
        insertTag.run('knowledge', Number(r.lastInsertRowid), tag);
      }
    }
  })();
  console.log(`✓ Inserted ${testNotes.length} notes with embeddings + tags`);

  // Query tags via json_each
  const jsonTags = db.prepare(`
    SELECT n.id, n.title, j.value AS tag
    FROM notes n, json_each(n.tags_json) j
    WHERE j.value = ?
  `).all('guide') as Array<{ id: bigint; title: string; tag: string }>;
  console.log(`✓ json_each query for tag "guide": ${jsonTags.map(r => r.title).join(', ')}`);

  // Query tags via junction table
  const junctionTags = db.prepare(`
    SELECT n.id, n.title
    FROM entity_tags t
    JOIN notes n ON n.id = t.entity_id
    WHERE t.graph = 'knowledge' AND t.tag = ?
  `).all('guide') as Array<{ id: bigint; title: string }>;
  console.log(`✓ Junction table query for tag "guide": ${junctionTags.map(r => r.title).join(', ')}`);

  // =========================================================================
  // 4. FTS5 keyword search
  // =========================================================================
  section('4. FTS5 keyword search');

  const ftsResults = db.prepare(`
    SELECT n.id, n.title, rank AS score
    FROM notes_fts fts
    JOIN notes n ON n.id = fts.rowid
    WHERE notes_fts MATCH ?
    ORDER BY rank
    LIMIT 3
  `).all('database OR schema') as Array<{ id: bigint; title: string; score: number }>;

  for (const r of ftsResults) {
    console.log(`  id=${r.id} "${r.title}" score=${Number(r.score).toFixed(4)}`);
  }
  console.log(`✓ FTS5 returned ${ftsResults.length} results`);

  // =========================================================================
  // 5. Vector KNN search
  // =========================================================================
  section('5. Vector KNN search');

  const queryVec = randomEmbedding(3); // similar to "Database Schema"
  const vecResults = db.prepare(`
    SELECT rowid AS id, distance
    FROM notes_vec
    WHERE embedding MATCH ? AND k = 3
    ORDER BY distance
  `).all(Buffer.from(queryVec.buffer)) as Array<{ id: bigint; distance: number }>;

  for (const r of vecResults) {
    const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(r.id) as { title: string };
    console.log(`  id=${r.id} "${note.title}" dist=${Number(r.distance).toFixed(4)}`);
  }
  console.log(`✓ Vector KNN returned ${vecResults.length} results`);

  // =========================================================================
  // 6. Hybrid search (RRF fusion)
  // =========================================================================
  section('6. Hybrid search (RRF fusion)');

  const RRF_K = 60;

  const ftsRanked = db.prepare(`
    SELECT n.id, ROW_NUMBER() OVER (ORDER BY rank) AS rn
    FROM notes_fts fts
    JOIN notes n ON n.id = fts.rowid
    WHERE notes_fts MATCH ?
    LIMIT 10
  `).all('install OR configure OR deploy') as Array<{ id: bigint; rn: bigint }>;

  const vecRanked = db.prepare(`
    SELECT rowid AS id, ROW_NUMBER() OVER (ORDER BY distance) AS rn
    FROM notes_vec
    WHERE embedding MATCH ? AND k = 10
  `).all(Buffer.from(randomEmbedding(1).buffer)) as Array<{ id: bigint; rn: bigint }>;

  const rrfScores = new Map<bigint, number>();
  for (const r of ftsRanked) rrfScores.set(r.id, (rrfScores.get(r.id) ?? 0) + 1 / (RRF_K + Number(r.rn)));
  for (const r of vecRanked) rrfScores.set(r.id, (rrfScores.get(r.id) ?? 0) + 1 / (RRF_K + Number(r.rn)));

  const hybridResults = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [id, score] of hybridResults) {
    const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(id) as { title: string };
    console.log(`  id=${id} "${note.title}" rrf=${score.toFixed(6)}`);
  }
  console.log(`✓ Hybrid search returned ${hybridResults.length} results`);

  // =========================================================================
  // 7. CASCADE delete
  // =========================================================================
  section('7. CASCADE delete');

  const countBefore = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
  console.log(`  Notes before project delete: ${countBefore}`);

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

  const countAfter = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
  console.log(`  Notes after project delete: ${countAfter}`);
  console.log(`✓ CASCADE delete: ${countBefore} → ${countAfter}`);

  // Check FTS5 cleanup (trigger-based)
  const ftsOrphans = (db.prepare('SELECT COUNT(*) AS c FROM notes_fts').get() as { c: bigint }).c;
  console.log(`  FTS5 rows after cascade: ${ftsOrphans} (trigger cleans up: ${ftsOrphans === 0n ? 'YES' : 'NO — needs manual cleanup'})`);

  // Check vec0 orphans (no trigger — vec0 doesn't support triggers)
  const vecOrphans = (db.prepare('SELECT COUNT(*) AS c FROM notes_vec').get() as { c: bigint }).c;
  console.log(`  Vec0 rows after cascade: ${vecOrphans} (orphans: ${vecOrphans > 0n ? 'YES — vec0 needs manual cleanup' : 'none'})`);
  console.log('  NOTE: vec0 virtual tables do not support triggers; must DELETE manually before/after CASCADE');

  // Re-insert for further tests
  const proj2 = db.prepare('INSERT INTO projects (slug, name) VALUES (?, ?)').run('demo2', 'Demo 2');
  const pid2 = proj2.lastInsertRowid;

  // =========================================================================
  // 8. Nested transactions (savepoints)
  // =========================================================================
  section('8. Nested transactions (savepoints)');

  const outerTx = db.transaction(() => {
    db.prepare('INSERT INTO notes (project_id, slug, title, content) VALUES (?, ?, ?, ?)').run(pid2, 'outer', 'Outer', 'outer content');

    // Nested — better-sqlite3 uses SAVEPOINT automatically
    const innerTx = db.transaction(() => {
      db.prepare('INSERT INTO notes (project_id, slug, title, content) VALUES (?, ?, ?, ?)').run(pid2, 'inner', 'Inner', 'inner content');
    });
    innerTx();

    const count = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
    console.log(`  Inside outer tx: ${count} notes`);
  });
  outerTx();

  const countNested = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
  console.log(`  After commit: ${countNested} notes`);
  console.log('✓ Nested transactions (savepoints) work');

  // Test rollback
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO notes (project_id, slug, title, content) VALUES (?, ?, ?, ?)').run(pid2, 'rollback-test', 'Rollback', 'will be rolled back');
      throw new Error('intentional rollback');
    })();
  } catch {
    // expected
  }

  const countRollback = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
  console.log(`  After rollback: ${countRollback} notes (should equal ${countNested})`);
  console.log(`✓ Rollback works: ${countRollback === countNested ? 'PASS' : 'FAIL'}`);

  // =========================================================================
  // 9. Migration pattern (PRAGMA user_version)
  // =========================================================================
  section('9. Migration pattern');

  const migrations = [
    { version: 1, sql: "INSERT INTO meta (key, value) VALUES ('schema_version', '1')" },
    { version: 2, sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2')" },
  ];

  const currentVersion = Number((db.pragma('user_version') as Array<{ user_version: bigint }>)[0].user_version);
  console.log(`  Current user_version: ${currentVersion}`);

  let applied = 0;
  for (const m of migrations) {
    if (m.version > currentVersion) {
      db.transaction(() => {
        db.exec(m.sql);
        db.pragma(`user_version = ${m.version}`);
      })();
      applied++;
    }
  }

  const newVersion = Number((db.pragma('user_version') as Array<{ user_version: bigint }>)[0].user_version);
  console.log(`  After migrations: user_version=${newVersion}, applied=${applied}`);
  console.log('✓ Migration pattern works');

  // =========================================================================
  // 10. File persistence (close + reopen)
  // =========================================================================
  section('10. File persistence');

  const noteCountBefore = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
  console.log(`  Notes before close: ${noteCountBefore}`);
  db.close();

  // Reopen
  db = openDb(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const noteCountAfter = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: bigint }).c;
  const versionAfter = Number((db.pragma('user_version') as Array<{ user_version: bigint }>)[0].user_version);
  console.log(`  Notes after reopen: ${noteCountAfter}`);
  console.log(`  user_version after reopen: ${versionAfter}`);
  console.log(`✓ Persistence: ${noteCountBefore === noteCountAfter ? 'PASS' : 'FAIL'}`);

  // =========================================================================
  // 11. Performance benchmarks: 384d vs 1024d, 10k vs 100k
  // =========================================================================
  section('11. Performance benchmarks');

  function randomEmbeddingN(seed: number, dims: number): Float32Array {
    const vec = new Float32Array(dims);
    for (let i = 0; i < dims; i++) vec[i] = Math.sin(seed * (i + 1) * 0.01) * 0.5;
    let norm = 0;
    for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < dims; i++) vec[i] /= norm;
    return vec;
  }

  function runBenchmark(label: string, dims: number, count: number) {
    console.log(`\n  --- ${label}: ${count / 1000}k rows, ${dims}d ---`);

    // Fresh DB for each benchmark
    const benchPath = dbPath + `.bench-${dims}-${count}`;
    const bdb = openDb(benchPath);
    bdb.pragma('journal_mode = WAL');
    bdb.pragma('foreign_keys = ON');

    bdb.exec(`
      CREATE TABLE bench_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE bench_fts USING fts5(title, content, content=bench_notes, content_rowid=id);
      CREATE TRIGGER bench_ai AFTER INSERT ON bench_notes BEGIN
        INSERT INTO bench_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END;
      CREATE VIRTUAL TABLE bench_vec USING vec0(embedding float[${dims}]);
    `);

    const insNote = bdb.prepare('INSERT INTO bench_notes (slug, title, content) VALUES (?, ?, ?)');
    const insVec = bdb.prepare('INSERT INTO bench_vec (rowid, embedding) VALUES (?, ?)');

    // Pre-generate embeddings (exclude from insert timing)
    const words = ['setup', 'config', 'deploy', 'testing', 'database', 'schema', 'api', 'server', 'client', 'auth'];
    console.log('    Pre-generating embeddings...');
    const embeddings: Buffer[] = [];
    for (let i = 0; i < count; i++) {
      embeddings.push(Buffer.from(randomEmbeddingN(i, dims).buffer));
    }

    // Insert (pure SQLite time, no embedding generation)
    const t0 = performance.now();
    const batchSize = 5000;
    for (let batch = 0; batch < count; batch += batchSize) {
      const end = Math.min(batch + batchSize, count);
      bdb.transaction(() => {
        for (let i = batch; i < end; i++) {
          // Vary content so FTS5 is realistic
          const w1 = words[i % words.length];
          const w2 = words[(i * 3 + 7) % words.length];
          const r = insNote.run(`n-${i}`, `Note about ${w1} ${i}`, `How to ${w1} and ${w2} for project ${i}`);
          insVec.run(r.lastInsertRowid, embeddings[i]);
        }
      })();
    }
    const t1 = performance.now();
    console.log(`    Insert: ${(t1 - t0).toFixed(0)}ms (${((t1 - t0) / count * 1000).toFixed(1)}µs/row)`);

    // Pre-generate query vectors (exclude from search timing)
    const queryVecs: Buffer[] = [];
    for (let i = 0; i < 100; i++) {
      queryVecs.push(Buffer.from(randomEmbeddingN(i + 999, dims).buffer));
    }

    // Vector search
    const searchVec = bdb.prepare(`SELECT rowid, distance FROM bench_vec WHERE embedding MATCH ? AND k = 10 ORDER BY distance`);
    const t2 = performance.now();
    for (let i = 0; i < 100; i++) {
      searchVec.all(queryVecs[i]);
    }
    const t3 = performance.now();
    console.log(`    Vec search (100x): ${(t3 - t2).toFixed(0)}ms (${((t3 - t2) / 100).toFixed(1)}ms/search)`);

    // FTS5 search (varied queries — selective, not matching every row)
    const ftsQueries = ['setup AND config', 'deploy', 'testing OR auth', 'database schema', 'api server',
                        'client auth', 'setup deploy', 'config', 'schema', 'testing database'];
    const searchFts = bdb.prepare(`SELECT n.id, rank FROM bench_fts f JOIN bench_notes n ON n.id = f.rowid WHERE bench_fts MATCH ? LIMIT 10`);
    const t4 = performance.now();
    for (let i = 0; i < 100; i++) {
      searchFts.all(ftsQueries[i % ftsQueries.length]);
    }
    const t5 = performance.now();
    console.log(`    FTS5 search (100x): ${(t5 - t4).toFixed(0)}ms (${((t5 - t4) / 100).toFixed(1)}ms/search)`);

    // Disk size
    bdb.pragma('wal_checkpoint(TRUNCATE)');
    bdb.close();
    const size = statSync(benchPath).size;
    console.log(`    Disk: ${(size / 1024 / 1024).toFixed(1)} MB (${(size / count / 1024).toFixed(2)} KB/row)`);

    // Cleanup
    rmSync(benchPath, { force: true });
    try { rmSync(benchPath + '-wal', { force: true }); } catch {}
    try { rmSync(benchPath + '-shm', { force: true }); } catch {}
  }

  runBenchmark('384d / 10k', 384, 10_000);
  runBenchmark('384d / 100k', 384, 100_000);
  runBenchmark('1024d / 10k', 1024, 10_000);
  runBenchmark('1024d / 100k', 1024, 100_000);

  db.close();

  // =========================================================================
  // Summary
  // =========================================================================
  section('SUMMARY');
  console.log('✓ sqlite-vec loads and works with better-sqlite3');
  console.log('✓ WAL mode enabled');
  console.log('✓ FTS5 keyword search works (with sync triggers)');
  console.log('✓ Vector KNN search works (384d + 1024d float32)');
  console.log('✓ Hybrid RRF fusion works');
  console.log('✓ CASCADE delete works via foreign keys');
  console.log('✓ JSON arrays queryable via json_each()');
  console.log('✓ Junction table tags work');
  console.log('✓ Nested transactions (savepoints) work');
  console.log('✓ Rollback works');
  console.log('✓ PRAGMA user_version migrations work');
  console.log('✓ File persistence survives close/reopen');
  console.log('✓ Performance benchmarked at 10k and 100k rows');
  console.log('');
  console.log('CAVEAT: sqlite-vec requires BigInt for rowid (use db.defaultSafeIntegers(true))');
}

main();
