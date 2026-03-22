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

When not set, allows all origins (`*`). `credentials: true` is always enabled to support cookie-based auth behind reverse proxies.

## MCP authentication

MCP endpoints (`/mcp/{projectId}`) are now authenticated via API key when users are configured. Previously, MCP was unprotected. The API key is sent via the `Authorization: Bearer <apiKey>` header, and comparison uses `crypto.timingSafeEqual` (same as REST API key checks).

## Readonly mode (defense-in-depth)

The `readonly: true` graph setting provides an additional layer of protection:
- MCP mutation tools are not registered (invisible to clients)
- REST mutation endpoints return 403
- UI hides write buttons

This is useful for graphs that should be searchable but not modifiable — e.g., a shared knowledge base that only admins update directly. Even if a user has `rw` access, readonly overrides it at the graph level.

## Access control

5-level ACL with per-graph granularity. See [Authentication](authentication.md).

## Session management

- MCP HTTP sessions have configurable idle timeout (default: 30 min)
- JWT access tokens expire after configurable TTL (default: 15 min)
- JWT refresh tokens expire after configurable TTL (default: 7 days)
- Each JWT request validates user still exists in config (revocation on user removal)
