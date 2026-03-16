// In-memory LRU cache with TTL support

interface CacheEntry<T> {
  value: T
  expiresAt: number
  accessedAt: number
}

export class LRUCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private defaultTTL: number
  private hits = 0
  private misses = 0

  constructor(maxSize: number = 1000, defaultTTLMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize
    this.defaultTTL = defaultTTLMs
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.misses++
      return undefined
    }

    entry.accessedAt = Date.now()
    // Move to end (most recently used)
    this.store.delete(key)
    this.store.set(key, entry)

    this.hits++
    return entry.value
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    }

    if (this.store.size >= this.maxSize) {
      this.evict()
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
      accessedAt: Date.now(),
    })
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return false
    }
    return true
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }

  get hitRate(): number {
    const total = this.hits + this.misses
    return total > 0 ? this.hits / total : 0
  }

  get stats(): { size: number; hits: number; misses: number; hitRate: number } {
    return {
      size: this.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hitRate,
    }
  }

  getOrSet(key: string, factory: () => T, ttlMs?: number): T {
    const cached = this.get(key)
    if (cached !== undefined) return cached
    const value = factory()
    this.set(key, value, ttlMs)
    return value
  }

  async getOrSetAsync(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached
    const value = await factory()
    this.set(key, value, ttlMs)
    return value
  }

  prune(): number {
    const now = Date.now()
    let pruned = 0
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
        pruned++
      }
    }
    return pruned
  }

  keys(): string[] {
    return [...this.store.keys()]
  }

  values(): T[] {
    const now = Date.now()
    const result: T[] = []
    for (const entry of this.store.values()) {
      if (now <= entry.expiresAt) result.push(entry.value)
    }
    return result
  }

  private evict(): void {
    // Remove first entry (least recently used)
    const firstKey = this.store.keys().next().value
    if (firstKey !== undefined) {
      this.store.delete(firstKey)
    }
  }
}
