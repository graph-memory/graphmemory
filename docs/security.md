# Security

## Authentication

- **Password hashing**: scrypt via `node:crypto` with timing-safe verification
- **JWT tokens**: HS256 algorithm (explicitly specified in sign/verify), httpOnly cookies with `SameSite=Strict` and `Secure` (configurable via `server.cookieSecure`, defaults to true unless `NODE_ENV=development`)
- **API keys**: timing-safe comparison via `crypto.timingSafeEqual` for all key checks
- **Refresh tokens**: scoped to `/api/auth/refresh` path, validated against current user config

See [Authentication](authentication.md) for full details.

## CSRF protection

- `SameSite=Strict` on all auth cookies — cookies are only sent on same-origin requests
- No additional CSRF tokens needed — `SameSite=Strict` is sufficient for cookie-based auth
- API key authentication (Bearer header) is inherently CSRF-proof

## XSS protection

- Auth cookies are `httpOnly` — not accessible via `document.cookie` or JavaScript
- `X-Content-Type-Options: nosniff` header on all responses
- Attachment downloads use `Content-Disposition: attachment` to prevent inline rendering

## API key comparison

All API key checks use constant-time comparison:

```typescript
crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
```

This applies to:
- User API keys (`users.<id>.apiKey`)
- Embedding API key (`server.embeddingApi.apiKey`)
- Remote embedding API key (`embedding.remoteApiKey`)

## SSRF protection

Remote embedding URLs are validated to only allow `http:` and `https:` protocols. This prevents SSRF attacks via `file:`, `data:`, `javascript:`, or other URL schemes.

## Path traversal protection

### Attachment filenames

Validated at two levels:

1. **REST validation** (`src/api/rest/validation.ts`): `attachmentFilenameSchema` rejects filenames containing:
   - Path separators (`/`, `\`)
   - Parent directory traversal (`..`)
   - Null bytes and control characters
   - Enforces length limits (1–255 chars)

2. **MCP tool validation**: attachment tools also validate filenames with the same Zod schema (defense-in-depth)

3. **MCP add-attachment tools**: validate file path with `fs.statSync()` — reject directories, enforce 50 MB upload limit

### Attachment limits

Graph managers enforce hard limits on attachments (defined in `src/graphs/attachment-types.ts`):
- **10 MB** maximum per individual attachment file
- **20** maximum attachments per entity (note, task, or skill)

4. **Write-time sanitization** (`src/lib/file-mirror.ts`): `sanitizeFilename()` strips:
   - Null bytes
   - `..` sequences
   - Path separators (via `path.basename`)

### Content-Disposition

Attachment downloads use RFC 5987 encoding:

```
Content-Disposition: attachment; filename*=UTF-8''encoded-filename
X-Content-Type-Options: nosniff
```

Ensures correct handling of Unicode filenames and prevents MIME sniffing.

## Security headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

## CORS

Configurable via `server.corsOrigins`:

```yaml
server:
  corsOrigins:
    - "http://localhost:5173"
    - "https://app.example.com"
```

> **Security recommendation**: Always set `corsOrigins` when users are configured. Without it, all origins are allowed with `credentials: true`. While `SameSite=Strict` cookies mitigate most cross-origin attacks in modern browsers, explicit origin allowlisting provides defense-in-depth.

## MCP authentication

MCP endpoints (`/mcp/{projectId}`) are authenticated via API key when users are configured. Previously, MCP was unprotected. The API key is sent via the `Authorization: Bearer <apiKey>` header, and comparison uses `crypto.timingSafeEqual` (same as REST API key checks).

## OAuth 2.0 Authorization Code + PKCE

MCP clients that support OAuth (e.g., Claude.ai) can authenticate via the OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange, S256 method). This avoids sharing static API keys with third-party clients.

### Discovery

The server publishes RFC 8414 metadata at `GET /.well-known/oauth-authorization-server`, advertising all supported endpoints, grant types, and `code_challenge_methods_supported: ["S256"]`.

### Flow

1. The MCP client redirects the user's browser to the authorization endpoint (`/ui/auth/authorize`) with `response_type=code`, `code_challenge` (SHA-256 of the verifier, base64url-encoded), `code_challenge_method=S256`, `client_id`, `redirect_uri`, and optional `state`.
2. The consent page at `/ui/auth/authorize` shows the requesting service's hostname so the user knows which service is requesting access. The user must already hold a valid session cookie (i.e., be logged in to the UI).
3. After the user consents, the frontend POSTs to `POST /api/oauth/authorize`. The server verifies the active session JWT (`type: access` or `type: oauth_access`), generates a 32-byte random authorization code, stores it in the session store (keyed as `authcode:<code>`) with a 10-minute TTL, and returns a `redirectUrl` for the client callback.
4. The client exchanges the code at `POST /oauth/token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, and `code_verifier`. The server:
   - Retrieves and immediately deletes the code entry from the session store (single-use enforcement).
   - Verifies `redirect_uri` matches exactly.
   - Verifies PKCE: `base64url(sha256(code_verifier)) === code_challenge`.
   - Issues an access/refresh token pair on success.
5. Subsequent requests use the access token as `Authorization: Bearer <token>`. Refresh tokens are exchanged at `POST /oauth/token` with `grant_type=refresh_token`.

### Supported grant types

| Grant type | Use case |
|---|---|
| `authorization_code` | Interactive MCP clients (Claude.ai, browser-based tools) |
| `client_credentials` | Programmatic/machine clients using a user's `apiKey` as `client_secret` |
| `refresh_token` | Renewing an expired access token without re-authentication |

### JWT token types

OAuth flows introduce two additional JWT `type` values distinct from the cookie-based UI session tokens:

| Type | Description |
|---|---|
| `access` | UI session access token (cookie-based) |
| `refresh` | UI session refresh token (cookie-based, scoped to `/api/auth/refresh`) |
| `oauth_access` | OAuth access token (Bearer header) |
| `oauth_refresh` | OAuth refresh token; accepted only on `POST /oauth/token` with `grant_type=refresh_token` |

This separation ensures OAuth Bearer tokens cannot be used to call the UI session refresh endpoint and vice versa.

### Session store (auth code storage)

Authorization codes are stored in a `SessionStore` abstraction (`src/lib/session-store.ts`) rather than in-process memory or the JWT itself. Two implementations are provided:

| Implementation | Class | Notes |
|---|---|---|
| In-memory | `MemorySessionStore` | Default; uses `Map` with `setTimeout`-based expiry. Not suitable for multi-instance deployments. |
| Redis | `RedisSessionStore` | Wraps a `redis` client, uses `SET … EX` for atomic TTL. Safe for clustered/multi-process deployments. |

The store is injected into `createOAuthRouter()` so the correct backend can be wired at startup.

### Additional OAuth endpoints

| Endpoint | Description |
|---|---|
| `GET /api/oauth/userinfo` | Returns `{ sub, name, email }` for a valid `oauth_access` Bearer token |
| `POST /api/oauth/introspect` | RFC 7662 token introspection — returns `active`, `sub`, `token_type`, `exp`, `iat` |
| `POST /api/oauth/revoke` | Stub; returns 200 for client compatibility |
| `POST /api/oauth/end-session` | Stub; returns 200 for client compatibility |

## Readonly mode (defense-in-depth)

The `readonly: true` graph setting provides an additional layer of protection:
- MCP mutation tools are not registered (invisible to clients)
- REST mutation endpoints return 403
- UI hides write buttons

This is useful for graphs that should be searchable but not modifiable — e.g., a shared knowledge base that only admins update directly. Even if a user has `rw` access, readonly overrides it at the graph level.

## Access control

5-level ACL with per-graph granularity. Resolution chain (first match wins):

```
graph.access[userId] → project.access[userId] → workspace.access[userId]
→ server.access[userId] → server.defaultAccess
```

> **Note**: A graph-level `rw` overrides a server-level `deny` because the chain uses first-match-wins. This is intentional for granular control — admins can deny by default and grant per-graph access.

When users are configured, unauthenticated requests are rejected with 401. The `defaultAccess` setting only applies to authenticated users not explicitly listed in any ACL level.

See [Authentication](authentication.md) for full details.

## WebSocket authentication

WebSocket connections (`/api/ws`) require a valid JWT session cookie (`mgm_access`). API-key-only clients (Bearer header) cannot connect to WebSocket — this is by design since WebSocket is intended for the browser UI.

Events are filtered server-side: each client only receives events for projects they have read access to.

## Session management

- MCP HTTP sessions have configurable idle timeout (default: 30 min)
- JWT access tokens expire after configurable TTL (default: 15 min)
- JWT refresh tokens expire after configurable TTL (default: 7 days)
- OAuth access tokens share the same TTL as UI access tokens
- OAuth refresh tokens share the same TTL as UI refresh tokens
- OAuth authorization codes expire after 10 minutes and are single-use (deleted from the session store on first redemption)
- Each JWT request validates user still exists in config (revocation on user removal)

## Known limitations

### Refresh token replay
Refresh tokens (both cookie-based and OAuth) are not invalidated server-side after use. A stolen refresh token remains valid until expiry even after the legitimate user refreshes. For production deployments, use Redis as session store — this enables future server-side token blacklisting.

### API key storage
API keys are stored in plaintext in `graph-memory.yaml`. Protect this file with appropriate filesystem permissions (`chmod 600`). Do not commit it to version control. Consider mounting it read-only in Docker (`:ro`).

### OAuth revocation stubs
`POST /api/oauth/revoke` and `POST /api/oauth/end-session` are stubs that return 200 for client compatibility but do not actually invalidate tokens. Tokens remain valid until expiry.

### MCP session permissions
MCP tool visibility is determined at session creation time. If ACL configuration changes while an MCP session is active, the session retains its original permissions until reconnection.
