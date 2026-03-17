/**
 * Rate Limit Controller for the ShopFlow API Gateway.
 * Exposes endpoints for clients to check their current rate limit status
 * and quota consumption. Useful for dashboard UIs and monitoring.
 * See docs/rate-limiting.md for algorithm details and header reference.
 */

import { GatewayRequest, GatewayResponse, RateLimitConfig, RateLimitStatus } from '../types';
import { checkRateLimit, getRateLimitKey } from '../middleware/rate-limiter';

/** Rate limit tier overrides for different user roles */
interface RateLimitTier {
  name: string;
  maxRequests: number;
  burstSize: number;
  description: string;
}

/** Predefined rate limit tiers */
const RATE_LIMIT_TIERS: RateLimitTier[] = [
  { name: 'anonymous', maxRequests: 30, burstSize: 10, description: 'Unauthenticated requests (by IP)' },
  { name: 'customer', maxRequests: 100, burstSize: 20, description: 'Authenticated customer accounts' },
  { name: 'merchant', maxRequests: 500, burstSize: 50, description: 'Merchant API access' },
  { name: 'admin', maxRequests: 1000, burstSize: 100, description: 'Admin and internal services' },
];

/**
 * Handles GET /rate-limit/status — returns the caller's current rate limit status.
 * The response includes remaining tokens, limit, and reset time.
 * This endpoint itself does NOT consume a rate limit token.
 * @param request - The gateway request (may or may not be authenticated)
 * @param config - Rate limit configuration
 * @returns GatewayResponse with current rate limit status
 */
export function handleRateLimitStatus(request: GatewayRequest, config: RateLimitConfig): GatewayResponse {
  const { status } = checkRateLimit(request, config);
  const key = getRateLimitKey(request, config.keyPrefix);
  const tier = resolveTier(request);

  return {
    status: 200,
    data: {
      key,
      tier: tier.name,
      ...formatStatus(status),
    },
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}

/**
 * Handles GET /rate-limit/tiers — returns all available rate limit tiers.
 * Useful for documentation and client-side display.
 * @param request - The gateway request
 * @returns GatewayResponse with tier definitions
 */
export function handleRateLimitTiers(request: GatewayRequest): GatewayResponse {
  return {
    status: 200,
    data: { tiers: RATE_LIMIT_TIERS },
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}

/**
 * Resolves the rate limit tier for a request based on the user's role.
 * Falls back to "anonymous" tier for unauthenticated requests.
 * @param request - The gateway request with optional auth context
 * @returns The matching rate limit tier
 */
function resolveTier(request: GatewayRequest): RateLimitTier {
  if (!request.auth) return RATE_LIMIT_TIERS[0];

  const roleTier = RATE_LIMIT_TIERS.find((t) => t.name === request.auth?.role);
  return roleTier ?? RATE_LIMIT_TIERS[1];
}

/**
 * Formats a RateLimitStatus into a client-friendly response shape.
 * Converts Date objects to ISO strings and adds human-readable fields.
 * @param status - The raw rate limit status from the bucket
 * @returns Formatted status object
 */
function formatStatus(status: RateLimitStatus): Record<string, unknown> {
  return {
    remaining: status.remaining,
    limit: status.limit,
    resetAt: status.resetAt.toISOString(),
    retryAfter: status.retryAfter,
    headers: {
      'X-RateLimit-Limit': String(status.limit),
      'X-RateLimit-Remaining': String(status.remaining),
      'X-RateLimit-Reset': String(Math.floor(status.resetAt.getTime() / 1000)),
      ...(status.retryAfter ? { 'Retry-After': String(status.retryAfter) } : {}),
    },
  };
}
