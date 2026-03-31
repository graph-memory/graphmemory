/** Shared types used across all store modules. */

export type GraphName = 'code' | 'docs' | 'files' | 'knowledge' | 'tasks' | 'skills';

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchMode = 'hybrid' | 'vector' | 'keyword';

export interface SearchQuery {
  /** Text query for FTS5 keyword search */
  text?: string;
  /** Embedding vector for sqlite-vec similarity search */
  embedding?: number[];
  /** Search strategy (default 'hybrid'). 'keyword' ignores embedding, 'vector' ignores text */
  searchMode?: SearchMode;
  /** Max vector candidates before fusion/ranking (default 50) */
  topK?: number;
  /** Max results to return (default 20) */
  maxResults?: number;
  /** Minimum relevance score 0-1 (default 0) */
  minScore?: number;
}

export interface SearchResult {
  id: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Meta (key-value, shared interface for all stores)
// ---------------------------------------------------------------------------

export interface MetaMixin {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Cross-graph links (replaces proxy nodes)
// ---------------------------------------------------------------------------

export interface CrossLink {
  sourceGraph: GraphName;
  sourceId: number;
  targetGraph: GraphName;
  targetId: number;
  kind: string;
}

export interface CrossLinkFilter {
  sourceGraph?: GraphName;
  sourceId?: number;
  targetGraph?: GraphName;
  targetId?: number;
  kind?: string;
}

// ---------------------------------------------------------------------------
// Version conflict
// ---------------------------------------------------------------------------

export class VersionConflictError extends Error {
  constructor(
    public readonly current: number,
    public readonly expected: number,
  ) {
    super(`Version conflict: expected ${expected}, current is ${current}`);
    this.name = 'VersionConflictError';
  }
}

// ---------------------------------------------------------------------------
// Relation (same-graph edge)
// ---------------------------------------------------------------------------

export interface Relation {
  fromId: number;
  toId: number;
  kind: string;
}

