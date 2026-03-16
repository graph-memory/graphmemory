---
id: eventbus-for-domain-events
tags:
  - architecture
  - events
  - design-decision
createdAt: 2026-03-16T20:40:54.721Z
updatedAt: 2026-03-16T20:40:54.721Z
---

# EventBus for Domain Events

We use an in-process EventBus (pub/sub) for domain events rather than a message queue. This keeps the architecture simple for a single-process deployment. Events drive notifications, webhook delivery, and activity logging. If we need multi-process support later, we can swap to Redis pub/sub.
