---
id: jwt-vs-session-tokens
tags:
  - auth
  - security
  - design-decision
createdAt: 2026-03-16T20:40:54.667Z
updatedAt: 2026-03-16T20:40:54.667Z
relations:
  - to: oauth-implementation-notes
    kind: relates_to
---

# JWT vs Session Tokens

After evaluating JWT-only vs server-side sessions, we went with a hybrid approach: short-lived JWTs (15min) for API access + server-side refresh tokens (7 days). This gives us stateless request validation while maintaining the ability to revoke sessions. Password changes invalidate all sessions.
