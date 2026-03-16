---
id: debug-authentication-issues
source: user
confidence: 1
triggers:
  - auth broken
  - login not working
  - 401 error
  - token invalid
  - session expired
inputHints:
  - error message
  - HTTP status code
  - user email
filePatterns:
  - src/services/auth-service.ts
  - src/middleware/auth.ts
  - src/controllers/auth-controller.ts
tags:
  - auth
  - debugging
  - security
createdAt: 2026-03-16T20:40:55.236Z
updatedAt: 2026-03-16T20:40:55.236Z
relations:
  - to: handle-oauth-callback-errors
    kind: related_to
  - to: jwt-vs-session-tokens
    kind: references
    graph: knowledge
---

# Debug Authentication Issues

Step-by-step guide for diagnosing and fixing authentication problems in the TaskFlow auth system.

## Steps
1. Check JWT token expiry in request headers
2. Verify token signature with AUTH_SECRET env var
3. Check refresh token in database (sessions table)
4. Inspect auth middleware logs for rejection reason
5. Test with curl: POST /api/auth/login with valid credentials
6. If OAuth: verify callback URL matches config
