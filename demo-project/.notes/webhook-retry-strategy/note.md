---
id: webhook-retry-strategy
tags:
  - webhooks
  - reliability
createdAt: 2026-03-16T20:40:54.685Z
updatedAt: 2026-03-16T20:40:54.685Z
---

# Webhook Retry Strategy

Webhooks use exponential backoff: 1s, 5s, 30s, 2min, 10min. After 5 consecutive failures the webhook is auto-deactivated (circuit breaker pattern). This prevents overwhelming failing endpoints while giving transient errors time to recover. Reactivation is manual via API.
