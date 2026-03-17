/**
 * Pagination helpers supporting both cursor-based and offset-based strategies.
 * Cursor pagination is preferred for real-time feeds (no skipped/duplicated items),
 * while offset pagination is used for admin dashboards and search results.
 *
 * @see {@link ../types/index.ts} for PaginationParams, PageInfo types
 */

import { PageInfo, PaginationParams } from '@/types';

/** Default pagination settings */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Encode a cursor from an item ID and sort value.
 * Cursors are base64-encoded JSON payloads — opaque to the client.
 */
export function encodeCursor(id: string, sortValue: string | number): string {
  const payload = JSON.stringify({ id, sv: sortValue });
  return Buffer.from(payload).toString('base64url');
}

/**
 * Decode a cursor back into its constituent parts.
 * Returns null if the cursor is malformed or tampered with.
 */
export function decodeCursor(cursor: string): { id: string; sortValue: string | number } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { id: string; sv: string | number };
    if (!parsed.id || parsed.sv === undefined) return null;
    return { id: parsed.id, sortValue: parsed.sv };
  } catch {
    return null;
  }
}

/**
 * Normalize pagination params with defaults and enforce maximum limit.
 * Ensures limit is within [1, MAX_LIMIT] range.
 */
export function normalizePagination(params: Partial<PaginationParams>): PaginationParams {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return {
    limit,
    cursor: params.cursor,
    offset: params.offset ?? 0,
    sortBy: params.sortBy ?? 'createdAt',
    sortOrder: params.sortOrder ?? 'desc',
  };
}

/**
 * Apply offset-based pagination to an array of items.
 * Returns the sliced items and page info with total count.
 */
export function applyOffsetPagination<T>(
  items: T[],
  offset: number,
  limit: number,
): { items: T[]; pageInfo: PageInfo } {
  const sliced = items.slice(offset, offset + limit);
  return {
    items: sliced,
    pageInfo: {
      hasNextPage: offset + limit < items.length,
      hasPreviousPage: offset > 0,
      totalCount: items.length,
    },
  };
}

/**
 * Apply cursor-based pagination to an array of items.
 * Requires a `getId` function to locate the cursor position.
 */
export function applyCursorPagination<T>(
  items: T[],
  cursor: string | undefined,
  limit: number,
  getId: (item: T) => string,
): { items: T[]; pageInfo: PageInfo } {
  let startIndex = 0;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const cursorIndex = items.findIndex(item => getId(item) === decoded.id);
      if (cursorIndex >= 0) startIndex = cursorIndex + 1;
    }
  }

  const sliced = items.slice(startIndex, startIndex + limit);
  const lastItem = sliced[sliced.length - 1];

  return {
    items: sliced,
    pageInfo: {
      hasNextPage: startIndex + limit < items.length,
      hasPreviousPage: startIndex > 0,
      totalCount: items.length,
      cursor: lastItem ? encodeCursor(getId(lastItem), startIndex + limit) : undefined,
    },
  };
}
