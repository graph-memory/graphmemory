---
id: performance-profiling
source: learned
confidence: 0.85
triggers:
  - slow endpoint
  - performance issue
  - high latency
  - optimize
  - profiling
inputHints:
  - endpoint path
  - expected vs actual latency
filePatterns:
  - src/middleware/timing.ts
  - src/services/cache.ts
tags:
  - performance
  - profiling
  - debugging
createdAt: 2026-03-16T20:40:55.348Z
updatedAt: 2026-03-16T20:40:55.348Z
---

# Performance Profiling

How to profile and identify performance bottlenecks in the TaskFlow API.

## Steps
1. Enable request timing middleware (already active in dev)
2. Check /health for avg response times
3. Profile specific endpoint: autocannon -c 50 -d 10 http://localhost:3000/api/tasks
4. Analyze slow queries: SET log_min_duration_statement = 100 in PostgreSQL
5. Use clinic.js for Node.js profiling: npx clinic doctor -- node dist/index.js
6. Check LRU cache hit rates in logs
