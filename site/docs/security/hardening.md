---
title: "Security Hardening"
sidebar_label: "Hardening"
sidebar_position: 3
description: "Production security hardening for Graph Memory: CSRF protection, XSS prevention, rate limiting, path traversal defenses, and deployment best practices."
keywords: [security, CSRF, XSS, rate limiting, path traversal, production, hardening]
---

# Security Hardening

This page covers the security measures built into Graph Memory and best practices for production deployments.

## CSRF protection

Cross-Site Request Forgery is mitigated through two mechanisms:

- **`SameSite=Strict` cookies** -- all authentication cookies are set with `SameSite=Strict`, meaning they are only sent on same-origin requests. A malicious site cannot trigger authenticated requests to your Graph Memory server.
- **API key authentication** -- requests using `Authorization: Bearer` headers are inherently CSRF-proof, since browsers do not automatically attach custom headers to cross-origin requests.

No additional CSRF tokens are needed.

## XSS prevention

Cross-Site Scripting is mitigated at multiple layers:

- **httpOnly cookies** -- JWT tokens are stored in `httpOnly` cookies, making them inaccessible to `document.cookie` or any JavaScript running in the page. Even if an XSS vulnerability existed, the attacker could not steal session tokens.
- **`X-Content-Type-Options: nosniff`** -- set on all responses to prevent browsers from MIME-sniffing content into executable types.
- **Attachment downloads** -- files are served with `Content-Disposition: attachment`, forcing the browser to download rather than render them inline. This prevents uploaded HTML or SVG files from executing in the browser context.

## Timing-safe comparisons

All secret comparisons use `crypto.timingSafeEqual` to prevent timing attacks:

- User API key verification
- Embedding API key verification
- Remote embedding API key verification

This ensures an attacker cannot determine how many characters of a key are correct by measuring response times.

## Path traversal protection

Attachment filenames are validated at multiple levels (defense-in-depth):

1. **REST API validation** -- a Zod schema rejects filenames containing path separators (`/`, `\`), parent directory traversal (`..`), null bytes, and control characters. Filenames must be 1-255 characters.

2. **MCP tool validation** -- attachment tools apply the same filename validation schema.

3. **File path validation** -- the `add-attachment` tools verify the source file exists using `fs.statSync()`, reject directories, and enforce a 50 MB upload limit.

### Attachment limits

Graph managers enforce hard limits on attachments:
- **10 MB** maximum per individual attachment file
- **20** maximum attachments per entity (note, task, or skill)

4. **Write-time sanitization** -- when writing files to disk, `sanitizeFilename()` strips null bytes, `..` sequences, and path separators via `path.basename()`.

Attachment downloads use RFC 5987 encoding for `Content-Disposition` headers, ensuring correct handling of Unicode filenames.

## SSRF protection

Remote embedding URLs are validated to only allow `http:` and `https:` protocols. This prevents Server-Side Request Forgery attacks via `file:`, `data:`, `javascript:`, or other URL schemes.

## Security headers

All responses include:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframes |

## Rate limiting

Graph Memory includes rate limiting to protect against brute-force attacks and abuse.

Default rate limits (requests per minute per IP):

| Scope | Default | Description |
|-------|---------|-------------|
| **Global** | 600/min | All `/api/` endpoints |
| **Search** | 120/min | Search and embedding endpoints |
| **Auth** | 10/min | Login endpoint (`/api/auth/login`) |

These defaults are configurable via `server.rateLimit` in `graph-memory.yaml`:

```yaml
server:
  rateLimit:
    global: 600   # req/min per IP (0 = disabled)
    search: 120   # req/min per IP for search/embed
    auth: 10      # req/min per IP for login
```

### Authentication rate limiting

Login and authentication endpoints are rate-limited to prevent password brute-forcing. Failed login attempts from the same source are throttled.

### Search rate limiting

Search endpoints have rate limits to prevent resource exhaustion from expensive semantic search queries.

### Global rate limiting

All API endpoints are subject to a global rate limit to protect server resources.

## Session management

- **MCP HTTP sessions** have a configurable idle timeout (default: 30 minutes). Inactive sessions are cleaned up automatically.
- **JWT access tokens** expire after the configured TTL (default: 15 minutes). Each request validates that the user still exists in the config, so removing a user from `graph-memory.yaml` revokes their access immediately.
- **JWT refresh tokens** expire after the configured TTL (default: 7 days).

## CORS configuration

By default, Graph Memory allows all origins (`*`) without credentials. For production, configure explicit origins:

```yaml
server:
  corsOrigins:
    - "https://app.example.com"
    - "https://admin.example.com"
```

When explicit origins are configured, `credentials: true` is enabled so cookies work correctly. Without explicit origins, credentials mode is off -- this prevents credential leakage to arbitrary domains.

## Production deployment checklist

Follow these steps when deploying Graph Memory in production:

### Configure authentication

1. Add at least one user with `graphmemory users add`
2. Set a strong `jwtSecret` (use `openssl rand -base64 32`)
3. Set `defaultAccess: deny` to lock down access by default

### Network security

4. Run behind a reverse proxy (nginx, Caddy) with TLS termination
5. Configure `corsOrigins` to list only your allowed domains
6. Bind the server to `127.0.0.1` if only accessed via the reverse proxy

### Access control

7. Grant each user the minimum access level they need
8. Use `readonly: true` for graphs that should not be modified via the API
9. Review access configuration periodically

### Monitoring

10. Monitor server logs for authentication failures
11. Set up alerts for unusual API usage patterns
12. Keep Node.js and dependencies updated

### Cookie security

In production (when `NODE_ENV` is not `development`), cookies are automatically set with `Secure: true`, ensuring they are only transmitted over HTTPS. Make sure your reverse proxy terminates TLS before forwarding to Graph Memory.
