# SQLite Store — Findings

## Stack

- **better-sqlite3** — synchronous SQLite bindings for Node.js
- **sqlite-vec v0.1.9** — vector similarity search extension
- **FTS5** — built-in full-text search

## Critical Caveats

### 1. sqlite-vec requires BigInt for rowid

better-sqlite3 returns `number` for integers by default. sqlite-vec rejects `number` for rowid — only accepts `BigInt`.

**Fix:** call `db.defaultSafeIntegers(true)` after opening. Convert back with `Number()` on output.

### 2. vec0 not cleaned by CASCADE

Virtual tables don't support triggers. `ON DELETE CASCADE` on the parent table does NOT delete rows from vec0.

**Fix:** store must manually `DELETE FROM xxx_vec WHERE rowid IN (...)` before deleting from the parent table.

### 3. vec0 CREATE syntax

Don't use `INTEGER PRIMARY KEY` in vec0 definition — it causes insert errors with better-sqlite3:

```sql
-- WRONG
CREATE VIRTUAL TABLE notes_vec USING vec0(note_id INTEGER PRIMARY KEY, embedding float[384]);

-- CORRECT
CREATE VIRTUAL TABLE notes_vec USING vec0(embedding float[384]);
-- insert via: INSERT INTO notes_vec (rowid, embedding) VALUES (?, ?)
```

### 4. vec0 does not support INSERT OR REPLACE

Attempting `INSERT OR REPLACE INTO xxx_vec` throws `UNIQUE constraint failed`. Must DELETE then INSERT:

```typescript
// WRONG
db.prepare('INSERT OR REPLACE INTO notes_vec (rowid, embedding) VALUES (?, ?)').run(id, buf);

// CORRECT
db.prepare('DELETE FROM notes_vec WHERE rowid = ?').run(id);
db.prepare('INSERT INTO notes_vec (rowid, embedding) VALUES (?, ?)').run(id, buf);
```

### 5. FTS5 sync via triggers

FTS5 content tables (`content=xxx`) require manual sync triggers (INSERT/UPDATE/DELETE) to stay in sync with the source table.

## Benchmarks

Measured on macOS (Apple Silicon). Embeddings pre-generated, timings are pure SQLite.

| Config | Insert | Vec Search | FTS5 Search | Disk |
|--------|--------|------------|-------------|------|
| 384d / 10k | 275ms (28µs/row) | 3.6ms/q | 0.1ms/q | 16.8 MB (1.7 KB/row) |
| 384d / 100k | 2.8s (28µs/row) | 36.3ms/q | 0.5ms/q | 165 MB (1.7 KB/row) |
| 1024d / 10k | 454ms (45µs/row) | 9.8ms/q | 0.1ms/q | 41.9 MB (4.3 KB/row) |
| 1024d / 100k | 4.7s (47µs/row) | 99.3ms/q | 0.6ms/q | 410 MB (4.2 KB/row) |

### Takeaways

- **384d preferred** — 3.6x faster vector search, 2.5x less disk vs 1024d
- **FTS5 is fast** — sub-millisecond regardless of embedding dimensions
- **Insert is linear** — ~28µs/row for 384d, stable at any scale
- **100k rows at 384d** is practical — 36ms vector search, 165 MB disk
- **100k rows at 1024d** is borderline — 99ms vector search, 410 MB disk

## Migration Strategy

Use `PRAGMA user_version` — built into SQLite, no external framework:

```typescript
const migrations = [
  { version: 1, sql: '...' },
  { version: 2, sql: '...' },
];

const current = db.pragma('user_version')[0].user_version;
for (const m of migrations) {
  if (m.version > current) {
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}
```
