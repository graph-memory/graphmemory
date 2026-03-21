---
title: "Authentication"
sidebar_label: "Authentication"
sidebar_position: 1
description: "Set up password-based login and API key authentication for Graph Memory, including user management, JWT tokens, and MCP client authentication."
keywords: [authentication, login, API key, JWT, password, scrypt, MCP authentication]
---

# Authentication

Graph Memory supports two authentication methods: password-based login for the web UI and API key tokens for programmatic access.

## When is authentication needed?

**When no users are configured** in `graph-memory.yaml`, Graph Memory runs in open-access mode. The UI loads without a login page, and all API endpoints are accessible without credentials. This is the default for local development.

**When at least one user is configured**, authentication is required. The UI shows a login page, API endpoints require valid credentials, and MCP endpoints require an API key.

## Setting up users

Use the CLI to add users interactively:

```bash
graphmemory users add --config graph-memory.yaml
```

The command prompts you for:

- **User ID** -- a short identifier (e.g., `alice`)
- **Name** -- display name
- **Email** -- used for login
- **Password** -- entered twice for confirmation (hidden input)

It then generates and writes into your config file:

- A **password hash** using scrypt (safe to store in version control)
- An **API key** in the format `mgm-{random}` for programmatic access

The resulting config looks like:

```yaml
users:
  alice:
    name: "Alice"
    email: "alice@example.com"
    passwordHash: "$scrypt$16384$8$1$<salt>$<hash>"
    apiKey: "mgm-abc123..."
```

## Password login (Web UI)

When you open the UI with authentication enabled, you see a login page.

### Login flow

1. Enter your **email** and **password**
2. The server verifies the password against the stored scrypt hash
3. On success, the server sets two **httpOnly cookies** containing JWT tokens
4. The UI loads and you have full access according to your permissions

### JWT tokens

Two tokens are issued as secure cookies:

| Cookie | Default lifetime | Purpose |
|--------|-----------------|---------|
| `mgm_access` | 15 minutes | Short-lived token for API requests |
| `mgm_refresh` | 7 days | Long-lived token for refreshing access |

Both cookies are `httpOnly` (not accessible to JavaScript) and `SameSite=Strict` (only sent on same-origin requests).

### Token refresh

When your access token expires, the UI automatically requests a new one using the refresh token. This happens transparently -- you stay logged in without interruption for up to 7 days (or your configured refresh token lifetime).

If the refresh token also expires, you are redirected to the login page.

### Token lifetimes

Customize token lifetimes in your config:

```yaml
server:
  jwtSecret: "your-secret-key-here"
  accessTokenTtl: "15m"
  refreshTokenTtl: "7d"
```

### JWT secret

The `jwtSecret` is **required** when users are configured. The server warns on startup if it is missing. Use a strong, random string:

```bash
openssl rand -base64 32
```

### Logout

Click the logout button in the sidebar or call `POST /api/auth/logout`. Both JWT cookies are cleared and you are returned to the login page.

## API key authentication

For scripts, CI/CD pipelines, and any programmatic access, use API keys instead of passwords.

Include the key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer mgm-abc123..." \
  http://localhost:3000/api/knowledge/notes
```

Each user has a unique API key generated when the user is created. The key is stored in `graph-memory.yaml` under `users.<id>.apiKey`.

## MCP authentication

MCP endpoints at `/mcp/{projectId}` use the same API key mechanism. When configuring your MCP client, include the API key:

```json
{
  "mcpServers": {
    "graph-memory": {
      "url": "http://localhost:3000/mcp/my-project",
      "headers": {
        "Authorization": "Bearer mgm-abc123..."
      }
    }
  }
}
```

When no users are configured, MCP endpoints remain open -- no API key needed.

## Auth middleware priority

When a request arrives, the server checks credentials in this order:

1. **JWT cookie** -- if a `jwtSecret` is configured, check the `mgm_access` cookie
2. **API key** -- check the `Authorization: Bearer` header against all user API keys
3. **Anonymous** -- if neither is present, the request uses `server.defaultAccess` permissions

The first successful match determines the user identity for the request.

## Password security

Passwords are hashed using Node.js `crypto.scrypt` with these parameters:

- **N** = 16384, **r** = 8, **p** = 1, **keylen** = 64
- A random 16-byte salt per password
- Verification uses `crypto.timingSafeEqual` to prevent timing attacks

The hash format is: `$scrypt$N$r$p$salt$hash`

No external dependencies are used for password hashing.
