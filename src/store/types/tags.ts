import type { GraphName, PaginationOptions } from './common';

// ---------------------------------------------------------------------------
// Tags Store (shared across all graphs)
// ---------------------------------------------------------------------------

export interface TagEntry {
  tag: string;
  /** How many entities use this tag (across all graphs) */
  count: number;
}

export interface EntityTag {
  graph: GraphName;
  entityId: number;
  tag: string;
}

export interface TagsStore {
  /** Set tags for an entity (replaces previous tags) */
  set(graph: GraphName, entityId: number, tags: string[]): void;

  /** Get all tags for an entity */
  get(graph: GraphName, entityId: number): string[];

  /** Remove all tags for an entity (e.g. on delete) */
  remove(graph: GraphName, entityId: number): void;

  /** List all known tags with usage counts, optionally filtered by graph */
  list(graph?: GraphName, pagination?: PaginationOptions): { results: TagEntry[]; total: number };

  /** Find all entities that have a given tag, optionally filtered by graph */
  findByTag(tag: string, graph?: GraphName, pagination?: PaginationOptions): { results: EntityTag[]; total: number };
}
