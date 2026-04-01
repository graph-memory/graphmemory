import Database from 'better-sqlite3';

/**
 * Reusable MetaMixin implementation.
 * Keys are stored with a prefix: `${prefix}:${key}` (or just `${key}` if prefix is empty).
 */
export class MetaHelper {
  private stmtGet: Database.Statement;
  private stmtSet: Database.Statement;
  private stmtDel: Database.Statement;

  constructor(db: Database.Database, private prefix: string) {
    this.stmtGet = db.prepare('SELECT value FROM meta WHERE key = ?');
    this.stmtSet = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    this.stmtDel = db.prepare('DELETE FROM meta WHERE key = ?');
  }

  private key(k: string): string {
    return this.prefix ? `${this.prefix}:${k}` : k;
  }

  getMeta(key: string): string | null {
    const row = this.stmtGet.get(this.key(key)) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.stmtSet.run(this.key(key), value);
  }

  deleteMeta(key: string): void {
    this.stmtDel.run(this.key(key));
  }
}
