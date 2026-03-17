# Rate Limiting

The ShopFlow API Gateway implements rate limiting using a token bucket algorithm. Every request consumes one token from the caller's bucket. When the bucket is empty, requests are rejected with `429 Too Many Requests` until tokens refill.

See [api-reference.md](api-reference.md) for the rate limit status endpoints.

## Token Bucket Algorithm

The token bucket algorithm provides a balance between strict rate enforcement and burst tolerance:

```
┌─────────────────────────────┐
│        Token Bucket         │
│                             │
│  Capacity: burstSize (20)   │
│  Refill: maxRequests/window │
│                             │
│  ████████████░░░░░░░░       │
│  12 tokens remaining        │
│                             │
│  Refill rate: 100/60s       │
│  = 1.67 tokens/second       │
└─────────────────────────────┘
```

### How It Works

1. Each rate limit key (per-IP or per-user) gets a bucket with `burstSize` initial tokens
2. Every request consumes one token
3. Tokens refill continuously at `maxRequests / windowMs` rate
4. The bucket cannot hold more than `burstSize` tokens (prevents unbounded accumulation)
5. When tokens reach zero, requests are rejected until refill

### Burst Handling

The `burstSize` parameter allows short bursts of traffic above the sustained rate. For example, with `maxRequests: 100` per minute and `burstSize: 20`:

- A client can send 20 requests instantly (burst)
- After the burst, they can sustain ~1.67 requests/second
- If they pause for a while, tokens accumulate back up to 20

## Configuration

Rate limits are configured via environment variables:

| Variable               | Default | Description                          |
|------------------------|---------|--------------------------------------|
| `RATE_LIMIT_WINDOW_MS` | 60000   | Time window in milliseconds          |
| `RATE_LIMIT_MAX`       | 100     | Maximum requests per window          |
| `RATE_LIMIT_BURST`     | 20      | Maximum burst size (bucket capacity) |

### Per-Role Tiers

Different user roles have different rate limits. The tier is determined by the authenticated user's role:

| Tier       | Max Requests | Burst Size | Key Format            |
|------------|-------------|------------|-----------------------|
| anonymous  | 30/min      | 10         | `rl:ip:<ip_address>`  |
| customer   | 100/min     | 20         | `rl:user:<user_id>`   |
| merchant   | 500/min     | 50         | `rl:user:<user_id>`   |
| admin      | 1000/min    | 100        | `rl:user:<user_id>`   |

Anonymous requests are keyed by IP address (from `X-Forwarded-For` header). Authenticated requests are keyed by user ID, providing a consistent limit regardless of the client's IP.

## Response Headers

Every response includes rate limit headers, even for successful requests:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705312260
```

| Header                  | Description                                |
|-------------------------|--------------------------------------------|
| `X-RateLimit-Limit`    | Total requests allowed per window          |
| `X-RateLimit-Remaining`| Requests remaining in the current window   |
| `X-RateLimit-Reset`    | Unix timestamp when the window resets      |
| `Retry-After`          | Seconds until next request allowed (429 only)|

## Error Response

When rate limited, the gateway returns:

```json
{
  "status": 429,
  "error": "Rate limit exceeded. Retry after 12 seconds.",
  "correlationId": "req_abc123",
  "duration": 1
}
```

With the `Retry-After` header:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705312260
```

## Checking Your Status

Clients can check their current rate limit status without consuming a token:

```bash
curl http://localhost:4000/rate-limit/status \
  -H "Authorization: Bearer <token>"
```

See the [api-reference.md](api-reference.md) for the full response format.

## Bucket Cleanup

Stale buckets (not accessed within 2x the window) are cleaned up periodically to prevent memory growth. The cleanup interval is 60 seconds.

## Implementation Notes

- The rate limiter is implemented in `src/middleware/rate-limiter.ts`
- Bucket state is stored in memory (not shared across gateway instances)
- For multi-instance deployments, consider Redis-backed rate limiting
- The algorithm is based on the standard token bucket with continuous refill
- See the controller at `src/controllers/rate-limit-controller.ts` for status endpoints
