---
id: configure-rate-limiting
source: user
confidence: 1
triggers:
  - rate limit
  - too many requests
  - 429 error
  - throttle
inputHints:
  - endpoint path
  - desired limit
filePatterns:
  - src/config/rate-limits.ts
  - src/middleware/rate-limiter.ts
tags:
  - security
  - rate-limiting
  - middleware
createdAt: 2026-03-16T20:40:55.292Z
updatedAt: 2026-03-16T20:40:55.292Z
relations:
  - to: performance-profiling
    kind: related_to
  - to: why-token-bucket-for-rate-limiting
    kind: references
    graph: knowledge
---

# Configure Rate Limiting

How to configure and tune rate limiting for API endpoints.

## Steps
1. Edit rate limit config in src/config/rate-limits.ts
2. Set limits per endpoint group (auth: 5/min, api: 100/min, webhooks: 50/min)
3. Test with bombardment: npx autocannon -c 10 -d 5 http://localhost:3000/api/tasks
4. Check response headers: X-RateLimit-Remaining, X-RateLimit-Reset
5. Monitor 429 responses in logs
