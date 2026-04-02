import Database from 'better-sqlite3';
import { num } from './bigint';

export interface Migration {
  version: number;
  sql: string;
}

/**
 * Run pending migrations against the database.
 * Uses PRAGMA user_version to track which migrations have been applied.
 * Each migration runs in its own transaction.
 *
 * @returns number of migrations applied
 */
export function runMigrations(db: Database.Database, migrations: Migration[]): number {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const current = num((db.pragma('user_version') as Array<{ user_version: bigint }>)[0].user_version);
  let applied = 0;

  for (const m of sorted) {
    if (m.version > current) {
      db.transaction(() => {
        db.exec(m.sql);
        if (!Number.isInteger(m.version) || m.version < 0) {
          throw new Error(`Invalid migration version: ${m.version}`);
        }
        db.pragma(`user_version = ${m.version}`);
      })();
      applied++;
    }
  }

  return applied;
}

/** Get the current schema version */
export function getSchemaVersion(db: Database.Database): number {
  return num((db.pragma('user_version') as Array<{ user_version: bigint }>)[0].user_version);
}
