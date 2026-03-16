---
id: handle-oauth-callback-errors
source: learned
confidence: 0.9
triggers:
  - oauth callback failed
  - oauth error
  - google login broken
  - github login broken
inputHints:
  - OAuth provider
  - error code from callback
filePatterns:
  - src/controllers/auth-controller.ts
  - src/services/oauth-service.ts
tags:
  - auth
  - oauth
  - debugging
createdAt: 2026-03-16T20:40:55.362Z
updatedAt: 2026-03-16T20:40:55.362Z
---

# Handle OAuth Callback Errors

Troubleshoot common OAuth callback failures for Google and GitHub providers.

## Steps
1. Check callback URL matches exactly in OAuth provider console
2. Verify OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env
3. Check server logs for token exchange errors
4. Test with curl: simulate authorization code exchange
5. Verify redirect_uri encoding (no double-encoding)
6. Check if user already exists with same email (account linking)
