/** Shared types used across all store modules. */

export type GraphName = 'code' | 'docs' | 'files' | 'knowledge' | 'tasks' | 'skills' | 'epics' | 'tags';

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
  id: number;
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
// Edges (unified graph edges — same-graph and cross-graph)
// ---------------------------------------------------------------------------

export interface Edge {
  fromGraph: GraphName;
  fromId: number;
  toGraph: GraphName;
  toId: number;
  kind: string;
}

export interface EdgeFilter {
  fromGraph?: GraphName;
  fromId?: number;
  toGraph?: GraphName;
  toId?: number;
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
