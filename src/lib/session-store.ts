import type { RedisClientType } from 'redis';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SessionStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<boolean>;
  /** Atomically get and delete a key (single-use codes). */
  getAndDelete(key: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class MemorySessionStore implements SessionStore {
  private store = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Clear existing timer if overwriting
    const existing = this.store.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => { this.store.delete(key); }, ttlSeconds * 1000);
    // Don't keep process alive just for cleanup timers
    if (timer.unref) timer.unref();
    this.store.set(key, { value, timer });
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.store.delete(key);
    return true;
  }

  async getAndDelete(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    clearTimeout(entry.timer);
    this.store.delete(key);
    return entry.value;
  }
}

// ---------------------------------------------------------------------------
// Redis implementation
// ---------------------------------------------------------------------------

export class RedisSessionStore implements SessionStore {
  constructor(
    private client: RedisClientType,
    private prefix: string,
  ) {}

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`${this.prefix}${key}`, value, { EX: ttlSeconds });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(`${this.prefix}${key}`);
  }

  async delete(key: string): Promise<boolean> {
    const count = await this.client.del(`${this.prefix}${key}`);
    return count > 0;
  }

  async getAndDelete(key: string): Promise<string | null> {
    return this.client.getDel(`${this.prefix}${key}`);
  }
}
