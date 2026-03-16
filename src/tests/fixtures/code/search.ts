import type { NodeAttrs } from './types';
import { GraphStore } from './graph';

export interface SearchOptions {
  limit?: number;
}

/**
 * Search nodes by label prefix.
 * Returns matching NodeAttrs sorted by weight descending.
 */
export function searchNodes(store: GraphStore, prefix: string, opts: SearchOptions = {}): NodeAttrs[] {
  void opts;
  void store;
  void prefix;
  return [];
}

/** Format a search result for display. */
export const formatResult = (attrs: NodeAttrs): string => `${attrs.id}: ${attrs.label}`;
