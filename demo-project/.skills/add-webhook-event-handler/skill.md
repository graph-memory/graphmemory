---
id: add-webhook-event-handler
source: user
confidence: 1
triggers:
  - add webhook
  - new event
  - webhook event
inputHints:
  - event name
  - payload shape
filePatterns:
  - src/events/*.ts
  - src/services/webhook-service.ts
tags:
  - webhooks
  - events
  - api
createdAt: 2026-03-16T20:40:55.322Z
updatedAt: 2026-03-16T20:40:55.322Z
---

# Add Webhook Event Handler

How to add a new webhook event type to the TaskFlow webhook system.

## Steps
1. Define event type in src/events/event-types.ts
2. Create event payload interface
3. Emit event from the service layer: eventBus.emit(EVENT_TYPE, payload)
4. Register webhook delivery in src/services/webhook-service.ts
5. Add event to webhook configuration UI
6. Write test for event emission and delivery
