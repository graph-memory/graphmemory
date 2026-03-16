---
id: add-rest-endpoint
source: user
confidence: 1
triggers:
  - add endpoint
  - new API route
  - create REST handler
  - add API
inputHints:
  - endpoint path
  - HTTP method
  - request/response schema
filePatterns:
  - src/controllers/*.ts
  - src/routes/*.ts
  - src/validators/*.ts
tags:
  - api
  - rest
  - backend
createdAt: 2026-03-16T20:40:55.221Z
updatedAt: 2026-03-16T20:40:55.221Z
relations:
  - to: run-and-debug-tests
    kind: related_to
---

# Add REST Endpoint

How to add a new REST API endpoint to the TaskFlow project. Covers route creation, validation, service layer, and tests.

## Steps
1. Create route handler in src/controllers/
2. Add Zod validation schema in src/validators/
3. Implement service method in src/services/
4. Register route in src/routes/index.ts
5. Write integration test in tests/
