---
id: why-token-bucket-for-rate-limiting
tags:
  - architecture
  - rate-limiting
  - design-decision
createdAt: 2026-03-16T20:40:54.648Z
updatedAt: 2026-03-16T20:40:54.648Z
relations:
  - to: performance-baseline
    kind: relates_to
---

# Why Token Bucket for Rate Limiting

We evaluated three rate limiting strategies: fixed window, sliding window, and token bucket. Token bucket was chosen because it handles burst traffic gracefully while maintaining a steady average rate. The sliding window counter is used as a secondary check for auth endpoints.
