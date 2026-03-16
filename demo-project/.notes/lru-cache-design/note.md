---
id: lru-cache-design
tags:
  - caching
  - performance
createdAt: 2026-03-16T20:40:54.777Z
updatedAt: 2026-03-16T20:40:54.777Z
relations:
  - to: performance-baseline
    kind: supports
---

# LRU Cache Design

The LRU cache uses a Map (insertion-ordered) for O(1) get/set with TTL expiry. On access, entries are deleted and re-inserted at the end. Eviction removes the first entry (least recently used). Hit rate tracking is built in for monitoring. The cache is generic and used for user sessions, project lookups, and search results.
