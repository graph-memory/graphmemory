import type { NodeAttrs } from './types';
import { GraphStore } from './graph';

// Regular comment (not JSDoc)
// Another regular comment
let counter = 0;

/** An abstract base for all repositories. */
export abstract class AbstractRepo<T extends NodeAttrs> {
  /** The internal store. */
  protected store: GraphStore;

  constructor(store: GraphStore) {
    this.store = store;
  }

  /** Find entity by id. */
  abstract findById(id: string): T | undefined;

  /** Count all entities. */
  count(): number {
    return 0;
  }
}

/** A concrete repository with generic extends. */
export class ConcreteRepo extends AbstractRepo<NodeAttrs> implements Iterable<NodeAttrs> {
  findById(id: string): NodeAttrs | undefined {
    return this.store.get(id);
  }

  [Symbol.iterator](): Iterator<NodeAttrs> {
    return [][Symbol.iterator]();
  }
}

/** Processor interface with method signatures. */
export interface Processor {
  /** Process a single item. */
  process(item: NodeAttrs): void;
  /** Reset the processor state. */
  reset(): void;
  /** The processor name. */
  readonly name: string;
}

/** Format with arrow body. */
export const transform = (items: NodeAttrs[]): string[] => {
  return items.map(i => i.label);
};

/** Outer function with nested named function. */
export function pipeline(data: NodeAttrs[]): NodeAttrs[] {
  function filterValid(items: NodeAttrs[]): NodeAttrs[] {
    return items.filter(i => i.weight > 0);
  }

  return filterValid(data);
}

declare function externalFetch(url: string): Promise<unknown>;

export { NodeAttrs } from './types';
