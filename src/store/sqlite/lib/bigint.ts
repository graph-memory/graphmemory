/** Convert BigInt (from better-sqlite3 safeIntegers) to number */
export function num(v: bigint | number): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

/** Current timestamp in ms as BigInt (for SQLite INTEGER columns) */
export function now(): bigint {
  return BigInt(Date.now());
}

/** Escape LIKE special characters (\, %, _) for safe use in SQL LIKE patterns with ESCAPE '\' */
export function likeEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

import { EMBEDDING_DIM } from '../migrations/v001';

/** Assert that an embedding has the expected dimensionality */
export function assertEmbeddingDim(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`);
  }
}

/**
 * Max items per SQL IN-clause to stay within SQLite's SQLITE_MAX_VARIABLE_NUMBER.
 * Reserves a few slots for other query params.
 */
export const SQL_CHUNK_SIZE = 900;

/** Split an array into chunks of at most `size` elements */
export function chunk<T>(arr: T[], size: number = SQL_CHUNK_SIZE): T[][] {
  if (arr.length <= size) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Safely parse JSON with a fallback for corrupted data */
export function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
