# Authentication & Access Control

**Files**: `src/lib/jwt.ts`, `src/lib/access.ts`, `src/api/rest/index.ts`

## Overview

The system supports two authentication methods:

| Method | Use case | Transport |
|--------|----------|-----------|
| **Password + JWT cookies** | Web UI login | Browser (REST API) |
| **API key (Bearer token)** | Programmatic access | MCP HTTP, REST API, scripts |

## Password-based login (UI)

### Flow

```
User enters email + password on login page
  → POST /api/auth/login { email, password }
  → Server: resolveUserByEmail() → verifyPassword(scrypt) → sign JWT tokens
  → Set httpOnly cookies: mgm_access (path=/api), mgm_refresh (path=/api/auth/refresh)
  → UI receives 200 OK → AuthGate renders the app
```

### Password hashing

Uses Node.js `crypto.scrypt` (no external dependencies):

```
$scrypt$N$r$p$salt$hash
$scrypt$16384$8$1$<32-char-hex-salt>$<128-char-hex-hash>
```

Parameters: N=16384, r=8, p=1, keylen=64. Verification uses `crypto.timingSafeEqual`.

### JWT tokens

Two tokens, both in httpOnly cookies with `SameSite=Strict`:

| Cookie | Path | Default TTL | Purpose |
|--------|------|-------------|---------|
| `mgm_access` | `/api` | 15m | Short-lived access token |
| `mgm_refresh` | `/api/auth/refresh` | 7d | Long-lived refresh token |

Token payload: `{ userId: string, type: 'access' | 'refresh' }`.

TTL is configurable:
```yaml
server:
  jwtSecret: "your-secret-key-here"
  accessTokenTtl: "15m"      # 15 minutes
  refreshTokenTtl: "7d"      # 7 days
```

### Token refresh

When a request gets 401:
1. UI client calls `POST /api/auth/refresh` (refresh cookie sent automatically)
2. Server verifies refresh token, checks user still exists in config
3. Issues new access + refresh tokens
4. UI retries the original request

If refresh fails → redirect to login page.

### Logout

`POST /api/auth/logout` clears both cookies.

### jwtSecret

**Required** when users are defined in config. User-provided string in `server.jwtSecret`. The server warns on startup if users are configured but `jwtSecret` is missing.

## API key authentication

For programmatic access (scripts, MCP HTTP clients):

```
Authorization: Bearer mgm-key-abc123
```

API keys are defined per user in the config:
```yaml
users:
  alice:
    apiKey: "mgm-key-abc123"
```

Key comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

## Auth middleware priority

The middleware checks in order:

1. **Cookie JWT** — if `jwtSecret` is set, check `mgm_access` cookie → verify token → check user exists
2. **Bearer API key** — resolve user from `Authorization: Bearer <key>` header
3. **Anonymous** — no auth → uses `server.defaultAccess`

## Adding users

Use the CLI to add users interactively:

```bash
graphmemory users add --config graph-memory.yaml
```

This prompts for userId, name, email, password (hidden, with confirmation), generates:
- `passwordHash` — scrypt hash
- `apiKey` — random `mgm-{base64url}` key

And writes the user block into the YAML config file.

## Access control (ACL)

### Resolution chain

Per-user, per-graph access is resolved via a 5-level chain (first match wins):

```
graph.access[userId]
  → project.access[userId]
    → workspace.access[userId]
      → server.access[userId]
        → server.defaultAccess
```

### Access levels

| Level | Read | Write | Description |
|-------|------|-------|-------------|
| `rw` | yes | yes | Full access |
| `r` | yes | no | Read-only |
| `deny` | no | no | No access |

### Default behavior

When no users are configured, everything is open (`defaultAccess: rw`). This maintains backward compatibility.

### REST API enforcement

Access is enforced at the route level:
- **Read endpoints** (GET, search) require `r` or `rw`
- **Mutation endpoints** (POST, PUT, DELETE) require `rw`
- **Denied** → 403 Forbidden

### UI enforcement

The `AccessProvider` component makes per-graph access available to all pages. Read-only graphs hide create/edit/delete buttons and disable drag-drop on the kanban board.

### Configuration example

```yaml
server:
  defaultAccess: deny        # deny all by default
  access:
    admin: rw                # admin gets rw everywhere

projects:
  my-app:
    access:
      alice: r               # alice can read this project
    graphs:
      knowledge:
        access:
          alice: rw           # but alice can write to knowledge
```

## MCP authentication

MCP endpoints (`/mcp/{projectId}`) now support authentication via API key.

### How it works

- When users are configured in `graph-memory.yaml`, MCP endpoints require an `Authorization: Bearer <apiKey>` header
- When no users are configured, MCP remains open (backward-compatible)
- The API key is matched against `users.<id>.apiKey` in the config

### Per-user tool visibility

Based on the authenticated user's access level for each graph, the MCP server controls which tools are registered (visible to the client):

| Access level | Read tools (list, get, search) | Mutation tools (create, update, delete) |
|-------------|-------------------------------|----------------------------------------|
| `rw` | Visible | Visible |
| `r` | Visible | **Hidden** |
| `deny` | **Hidden** | **Hidden** |

This differs from REST API enforcement:
- **MCP** hides tools entirely — the client never sees tools it cannot use
- **REST** returns `403 Forbidden` for unauthorized requests, but the endpoints are always visible

### Readonly graph interaction

When a graph has `readonly: true`, mutation tools are hidden for all users regardless of their access level. See [Configuration](configuration.md) for details on the readonly setting.

## Cookie security

| Property | Value | Purpose |
|----------|-------|---------|
| `httpOnly` | `true` | Not accessible via JavaScript (XSS protection) |
| `SameSite` | `Strict` | Only sent on same-site requests (CSRF protection) |
| `Secure` | configurable via `server.cookieSecure` | Only sent over HTTPS |
| `path` | `/api` or `/api/auth/refresh` | Scoped to API routes |

The `Secure` flag is controlled by `server.cookieSecure` in the config. If not set, it falls back to `process.env.NODE_ENV !== 'development'`. Set it explicitly for production environments without HTTPS (e.g. behind a TLS-terminating reverse proxy):

```yaml
server:
  cookieSecure: false  # set to true if clients connect over HTTPS
```

## Auth status endpoint

`GET /api/auth/status` — always accessible (before auth middleware):

```json
{ "required": true, "authenticated": true, "userId": "alice", "name": "Alice" }
```

The response does **not** include the user's `apiKey` to prevent leaks in DevTools, proxy logs, or monitoring. Use the dedicated endpoint instead:

`GET /api/auth/apikey` — requires valid JWT cookie:

```json
{ "apiKey": "gm_..." }
```

The UI's Connect MCP dialog fetches the API key from this endpoint to pre-fill configuration snippets.

The UI's `AuthGate` component checks `/api/auth/status` on load:
- `required: false` → render app (no auth configured)
- `required: true, authenticated: false` → show login page
- `required: true, authenticated: true` → render app
