import { createSqliteStoreFactory } from '../helpers';
import { existsSync } from 'fs';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { SqliteStore } from '@/store';

describe('SQLite DB lifecycle', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => {
    cleanup();
  });

  it('creates the database file on open', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-test-'));
    const dbPath = join(dir, 'test.db');
    const s = new SqliteStore();

    expect(existsSync(dbPath)).toBe(false);
    s.open({ dbPath });
    expect(existsSync(dbPath)).toBe(true);

    s.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sets WAL journal mode', () => {
    const db = store.getDb();
    const mode = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(mode[0].journal_mode).toBe('wal');
  });

  it('enables foreign keys', () => {
    const db = store.getDb();
    const fk = db.pragma('foreign_keys') as Array<{ foreign_keys: bigint }>;
    expect(Number(fk[0].foreign_keys)).toBe(1);
  });

  it('sets busy_timeout', () => {
    const db = store.getDb();
    const bt = db.pragma('busy_timeout') as Array<{ timeout: bigint }>;
    expect(Number(bt[0].timeout)).toBe(5000);
  });

  it('sets synchronous to NORMAL', () => {
    const db = store.getDb();
    const sync = db.pragma('synchronous') as Array<{ synchronous: bigint }>;
    // NORMAL = 1
    expect(Number(sync[0].synchronous)).toBe(1);
  });

  it('throws on double open', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-test-'));
    const s = new SqliteStore();
    s.open({ dbPath: join(dir, 'test.db') });
    expect(() => s.open({ dbPath: join(dir, 'test2.db') })).toThrow('Store already open');
    s.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws on operations before open', () => {
    const s = new SqliteStore();
    expect(() => s.getMeta('key')).toThrow('Store not open');
  });

  it('close is idempotent', () => {
    store.close();
    store.close(); // should not throw
    // Prevent cleanup from double-closing
    cleanup = () => {};
  });
});

describe('SQLite transactions', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => {
    cleanup();
  });

  it('commits on success', () => {
    store.transaction(() => {
      store.setMeta('key1', 'value1');
    });
    expect(store.getMeta('key1')).toBe('value1');
  });

  it('rolls back on throw', () => {
    store.setMeta('before', 'yes');

    expect(() => {
      store.transaction(() => {
        store.setMeta('inside', 'yes');
        throw new Error('boom');
      });
    }).toThrow('boom');

    expect(store.getMeta('before')).toBe('yes');
    expect(store.getMeta('inside')).toBeNull();
  });

  it('supports nested transactions (savepoints)', () => {
    store.transaction(() => {
      store.setMeta('outer', '1');
      store.transaction(() => {
        store.setMeta('inner', '2');
      });
    });

    expect(store.getMeta('outer')).toBe('1');
    expect(store.getMeta('inner')).toBe('2');
  });

  it('returns value from transaction', () => {
    const result = store.transaction(() => {
      store.setMeta('key', 'val');
      return 42;
    });
    expect(result).toBe(42);
  });
});
