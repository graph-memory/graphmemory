---
id: performance-baseline
tags:
  - performance
  - benchmarks
createdAt: 2026-03-16T20:40:54.870Z
updatedAt: 2026-03-16T20:40:54.870Z
---

# Performance Baseline

Current benchmarks on a 2-core instance:
- Task list (20 items): ~15ms
- Task create: ~25ms
- Search (full-text): ~40ms
- Auth login: ~120ms (bcrypt dominant)

Target p99 latency: <200ms for reads, <500ms for writes. Bcrypt rounds may need reduction if login latency becomes an issue.
