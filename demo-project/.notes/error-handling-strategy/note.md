---
id: error-handling-strategy
tags:
  - error-handling
  - convention
createdAt: 2026-03-16T20:40:54.795Z
updatedAt: 2026-03-16T20:40:54.795Z
relations:
  - to: validation-approach
    kind: depends_on
---

# Error Handling Strategy

All errors extend a base AppError with statusCode and code fields. Controllers catch service errors and map them to HTTP responses. Internal errors (5xx) are logged with stack traces but return generic messages to clients. Client errors (4xx) return specific error codes for programmatic handling.
