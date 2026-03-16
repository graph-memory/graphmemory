---
id: oauth-implementation-notes
tags:
  - auth
  - oauth
createdAt: 2026-03-16T20:40:54.850Z
updatedAt: 2026-03-16T20:40:54.850Z
---

# OAuth Implementation Notes

OAuth users (Google, GitHub) are created with a generated password hash. They can optionally set a password later for direct login. OAuth tokens are exchanged server-side (authorization code flow). The callback URL must match exactly. We store the OAuth provider ID for account linking.
