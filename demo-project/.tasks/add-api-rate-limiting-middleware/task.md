---
id: add-api-rate-limiting-middleware
status: done
priority: high
tags:
  - security
  - middleware
  - rate-limiting
dueDate: null
estimate: null
completedAt: null
createdAt: 2026-03-16T20:40:54.998Z
updatedAt: 2026-03-16T20:40:54.998Z
---

# Add API Rate Limiting Middleware

Apply rate limiting middleware to all API routes. Use stricter limits for auth endpoints (5/min) vs general endpoints (100/min). Include rate limit headers in responses (X-RateLimit-Remaining, X-RateLimit-Reset).
