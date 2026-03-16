---
id: add-request-logging-and-tracing
status: done
priority: medium
tags:
  - observability
  - logging
  - middleware
dueDate: null
estimate: null
completedAt: null
createdAt: 2026-03-16T20:40:55.173Z
updatedAt: 2026-03-16T20:40:55.173Z
---

# Add Request Logging and Tracing

Implement structured request logging with correlation IDs. Each request gets a unique ID passed via X-Request-ID header. Log request method, path, status, duration, and user. Forward correlation ID to downstream services.
