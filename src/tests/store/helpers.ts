import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStore } from '../../store';

export const TEST_DIM = 384;

export type StoreFactory = () => { store: SqliteStore; cleanup: () => void };

export function createSqliteStoreFactory(): StoreFactory {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-test-'));
    const dbPath = join(dir, 'test.db');
    const store = new SqliteStore();
    store.open({ dbPath });
    return {
      store,
      cleanup: () => {
        store.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  };
}

/** Create a normalized embedding vector from a seed */
export function seedEmbedding(seed: number, dim = TEST_DIM): number[] {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < dim; i++) v[i] = Math.sin(seed * (i + 1) * 0.01);
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  return v.map((x: number) => x / norm);
}

/** Zero embedding */
export function zeroEmbedding(dim = TEST_DIM): number[] {
  return new Array(dim).fill(0);
}
