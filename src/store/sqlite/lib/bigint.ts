/** Convert BigInt (from better-sqlite3 safeIntegers) to number */
export function num(v: bigint | number): number {
  return typeof v === 'bigint' ? Number(v) : v;
}

/** Current timestamp in ms as BigInt (for SQLite INTEGER columns) */
export function now(): bigint {
  return BigInt(Date.now());
}

/** Escape LIKE special characters (%, _) for safe use in SQL LIKE patterns */
export function likeEscape(text: string): string {
  return text.replace(/[%_]/g, '\\$&');
}

/** Safely parse JSON with a fallback for corrupted data */
export function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
