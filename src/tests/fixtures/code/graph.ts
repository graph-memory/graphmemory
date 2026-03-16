import type { NodeAttrs, NodeId } from './types';

/** Default weight for new nodes. */
export const DEFAULT_WEIGHT = 1.0;

/** Manages a simple in-memory graph. */
export class GraphStore {
  private nodes = new Map<NodeId, NodeAttrs>();

  /** Add or update a node. */
  set(id: NodeId, attrs: NodeAttrs): void {
    this.nodes.set(id, attrs);
  }

  /** Retrieve a node by id, or undefined. */
  get(id: NodeId): NodeAttrs | undefined {
    return this.nodes.get(id);
  }
}

/** Create a new empty GraphStore. */
export function createStore(): GraphStore {
  return new GraphStore();
}

function internalHelper(): void {}
