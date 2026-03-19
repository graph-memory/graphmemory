# Security

## Authentication

- **Password hashing**: scrypt via `node:crypto` with timing-safe verification
- **JWT tokens**: httpOnly cookies with `SameSite=Strict` and `Secure` (in production)
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

1. **REST validation** (`src/api/rest/validation.ts`): Zod schema rejects filenames containing:
   - Path separators (`/`, `\`)
   - Parent directory traversal (`..`)
   - Enforces length limits

2. **Write-time sanitization** (`src/lib/file-mirror.ts`): `sanitizeFilename()` strips:
   - Null bytes
   - `..` sequences
   - Path separators

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

When not set, allows all origins (`*`). Credentials are always enabled.

## Access control

4-level ACL with per-graph granularity. See [Authentication](authentication.md).

## Session management

- MCP HTTP sessions have configurable idle timeout (default: 30 min)
- JWT access tokens expire after configurable TTL (default: 15 min)
- JWT refresh tokens expire after configurable TTL (default: 7 days)
- Each JWT request validates user still exists in config (revocation on user removal)
