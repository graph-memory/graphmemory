---
id: architecture-decision-layered-services
tags:
  - architecture
  - design-decision
createdAt: 2026-03-16T20:40:54.630Z
updatedAt: 2026-03-16T20:40:54.630Z
relations:
  - to: eventbus-for-domain-events
    kind: relates_to
---

# Architecture Decision: Layered Services

We chose a layered architecture (Controller → Service → Store) to decouple HTTP concerns from business logic. Services depend on abstract store interfaces, making them testable without a database. This pattern also allows us to swap storage backends without changing business logic.
