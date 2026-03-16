// Token bucket rate limiter implementation

interface RateLimitEntry {
  tokens: number
  lastRefill: number
}

export interface RateLimitConfig {
  maxTokens: number
  refillRate: number // tokens per second
  refillInterval: number // ms between refills
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 100,
  refillRate: 10,
  refillInterval: 1000,
}

export class RateLimiter {
  private buckets = new Map<string, RateLimitEntry>()
  private config: RateLimitConfig
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  consume(key: string, tokens: number = 1): RateLimitResult {
    const entry = this.getOrCreate(key)
    this.refill(entry)

    if (entry.tokens >= tokens) {
      entry.tokens -= tokens
      return {
        allowed: true,
        remaining: Math.floor(entry.tokens),
        resetAt: entry.lastRefill + this.config.refillInterval,
      }
    }

    const waitTime = Math.ceil((tokens - entry.tokens) / this.config.refillRate * 1000)
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + waitTime,
      retryAfter: waitTime,
    }
  }

  check(key: string): RateLimitResult {
    const entry = this.getOrCreate(key)
    this.refill(entry)

    return {
      allowed: entry.tokens >= 1,
      remaining: Math.floor(entry.tokens),
      resetAt: entry.lastRefill + this.config.refillInterval,
    }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  startCleanup(intervalMs: number = 60000): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const staleThreshold = now - 5 * 60 * 1000

      for (const [key, entry] of this.buckets) {
        if (entry.lastRefill < staleThreshold) {
          this.buckets.delete(key)
        }
      }
    }, intervalMs)
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  get size(): number {
    return this.buckets.size
  }

  private getOrCreate(key: string): RateLimitEntry {
    let entry = this.buckets.get(key)
    if (!entry) {
      entry = { tokens: this.config.maxTokens, lastRefill: Date.now() }
      this.buckets.set(key, entry)
    }
    return entry
  }

  private refill(entry: RateLimitEntry): void {
    const now = Date.now()
    const elapsed = now - entry.lastRefill
    const tokensToAdd = (elapsed / 1000) * this.config.refillRate

    entry.tokens = Math.min(this.config.maxTokens, entry.tokens + tokensToAdd)
    entry.lastRefill = now
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

export class SlidingWindowCounter {
  private windows = new Map<string, Map<number, number>>()
  private windowSize: number
  private maxRequests: number

  constructor(windowSizeMs: number, maxRequests: number) {
    this.windowSize = windowSizeMs
    this.maxRequests = maxRequests
  }

  record(key: string): boolean {
    const now = Date.now()
    const windowKey = Math.floor(now / this.windowSize)

    let windows = this.windows.get(key)
    if (!windows) {
      windows = new Map()
      this.windows.set(key, windows)
    }

    const currentCount = windows.get(windowKey) ?? 0
    const prevCount = windows.get(windowKey - 1) ?? 0

    const elapsed = (now % this.windowSize) / this.windowSize
    const estimatedCount = prevCount * (1 - elapsed) + currentCount

    if (estimatedCount >= this.maxRequests) {
      return false
    }

    windows.set(windowKey, currentCount + 1)

    // clean old windows
    for (const [wk] of windows) {
      if (wk < windowKey - 1) windows.delete(wk)
    }

    return true
  }

  getCount(key: string): number {
    const now = Date.now()
    const windowKey = Math.floor(now / this.windowSize)

    const windows = this.windows.get(key)
    if (!windows) return 0

    const currentCount = windows.get(windowKey) ?? 0
    const prevCount = windows.get(windowKey - 1) ?? 0
    const elapsed = (now % this.windowSize) / this.windowSize

    return Math.floor(prevCount * (1 - elapsed) + currentCount)
  }
}
