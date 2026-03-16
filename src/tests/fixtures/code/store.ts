/** Contract for objects that can be persisted. */
export interface Storable {
  persist(): void;
}

/** Base class for all store implementations. */
export class BaseStore {
  protected data: Map<string, unknown> = new Map();

  /** Remove all entries from the store. */
  clear(): void {
    this.data.clear();
  }
}

/** A store with pluggable persistence support. */
export class CachedStore extends BaseStore implements Storable {
  /** Persist the store state. */
  persist(): void {
    // no-op in this implementation
  }
}
