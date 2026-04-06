import Database from 'better-sqlite3';
import sqliteVec from 'sqlite-vec';

/**
 * Open a SQLite database with all required extensions and pragmas.
 *
 * - defaultSafeIntegers(true) — required for sqlite-vec (BigInt rowids)
 * - sqlite-vec extension loaded
 * - WAL journal mode for concurrent reads
 * - foreign_keys enforced
 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.defaultSafeIntegers(true);
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}
