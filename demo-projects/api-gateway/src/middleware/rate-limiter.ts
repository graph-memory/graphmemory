/**
 * Rate Limiter middleware for the ShopFlow API Gateway.
 * Implements a token bucket algorithm with per-IP and per-user limits.
 * Returns standard rate limit headers (X-RateLimit-*) on every response.
 * See docs/rate-limiting.md for configuration details.
 */

import { RateLimitConfig, RateLimitStatus, GatewayRequest, GatewayResponse } from '../types';

/** Token bucket state for a single rate limit key */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  totalRequests: number;
}

/** In-memory bucket store keyed by rate limit key */
const buckets = new Map<string, TokenBucket>();

/**
 * Derives the rate limit key from a request.
 * Authenticated users are keyed by user ID; anonymous by IP.
 * @param request - The gateway request (may or may not have auth)
 * @param prefix - Key prefix from config (e.g., "rl:")
 * @returns The rate limit key string
 */
export function getRateLimitKey(request: GatewayRequest, prefix: string): string {
  if (request.auth) {
    return `${prefix}user:${request.auth.sub}`;
  }
  return `${prefix}ip:${request.headers['x-forwarded-for'] ?? 'unknown'}`;
}

/**
 * Refills tokens in a bucket based on elapsed time.
 * Tokens accumulate at a rate of maxRequests per windowMs, up to burstSize.
 * @param bucket - The token bucket to refill
 * @param config - Rate limit configuration
 */
function refillBucket(bucket: TokenBucket, config: RateLimitConfig): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / config.windowMs) * config.maxRequests;
  bucket.tokens = Math.min(config.burstSize, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Checks rate limit for a request and consumes a token if allowed.
 * Returns the current rate limit status regardless of outcome.
 * @param request - The incoming gateway request
 * @param config - Rate limit configuration
 * @returns Object with `allowed` flag and `status` details
 */
export function checkRateLimit(
  request: GatewayRequest,
  config: RateLimitConfig
): { allowed: boolean; status: RateLimitStatus } {
  const key = getRateLimitKey(request, config.keyPrefix);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.burstSize, lastRefill: Date.now(), totalRequests: 0 };
    buckets.set(key, bucket);
  }

  refillBucket(bucket, config);
  bucket.totalRequests++;

  const resetAt = new Date(bucket.lastRefill + config.windowMs);
  const retryAfter = bucket.tokens < 1 ? Math.ceil((config.windowMs - (Date.now() - bucket.lastRefill)) / 1000) : null;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      status: { remaining: Math.floor(bucket.tokens), limit: config.maxRequests, resetAt, retryAfter: null },
    };
  }

  return {
    allowed: false,
    status: { remaining: 0, limit: config.maxRequests, resetAt, retryAfter },
  };
}

/**
 * Builds a 429 Too Many Requests response with rate limit headers.
 * @param request - The rejected request
 * @param status - Current rate limit status
 * @returns A GatewayResponse with 429 status
 */
export function rateLimitResponse(request: GatewayRequest, status: RateLimitStatus): GatewayResponse {
  return {
    status: 429,
    error: `Rate limit exceeded. Retry after ${status.retryAfter} seconds.`,
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}

/**
 * Cleans up stale buckets that have not been accessed recently.
 * Called periodically to prevent memory growth.
 * @param maxAge - Maximum age in milliseconds before a bucket is removed
 * @returns Number of buckets removed
 */
export function cleanupBuckets(maxAge: number): number {
  const cutoff = Date.now() - maxAge;
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) {
      buckets.delete(key);
      removed++;
    }
  }
  return removed;
}
