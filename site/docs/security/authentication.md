---
title: "Authentication"
sidebar_label: "Authentication"
sidebar_position: 1
description: "Set up password-based login and API key authentication for Graph Memory, including user management, JWT tokens, and MCP client authentication."
keywords: [authentication, login, API key, JWT, password, scrypt, MCP authentication, OAuth]
---

# Authentication

Graph Memory supports three authentication methods: password-based login for the web UI, API keys for programmatic access, and OAuth 2.0 for AI chat clients such as Claude.ai (both `client_credentials` and Authorization Code + PKCE flows are supported).

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
    passwordHash: "$scrypt$65536$8$1$<salt>$<hash>"
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

Both cookies are `httpOnly` (not accessible to JavaScript) and `SameSite=Strict` (only sent on same-origin requests). The access token cookie is scoped to `path: '/api'`, and the refresh token cookie is scoped to `path: '/api/auth/refresh'` so it is only sent when refreshing tokens.

The `Secure` flag (HTTPS-only) is controlled by `server.cookieSecure` in the config. If not set, it defaults to `true` unless `NODE_ENV=development`. Set it explicitly for production environments:

```yaml
server:
  cookieSecure: true   # set to false if behind a TLS-terminating reverse proxy without HTTPS to the server
```

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

Click the logout button in the header bar or call `POST /api/auth/logout`. Both JWT cookies are cleared and you are returned to the login page.

### Retrieving your API key

Once logged in, you can retrieve your API key via the dedicated endpoint:

```
GET /api/auth/apikey
```

This requires a valid JWT cookie and returns `{ "apiKey": "mgm-..." }`. The API key is **not** included in the `/api/auth/status` response to prevent exposure in browser DevTools, proxy logs, or monitoring.

The UI's Connect MCP dialog uses this endpoint to auto-fill the API key in configuration snippets.

## API key authentication

For scripts, CI/CD pipelines, and any programmatic access, use API keys instead of passwords.

Include the key in the `Authorization` header:

```bash
curl -H "Authorization: Bearer mgm-abc123..." \
  http://localhost:3000/api/knowledge/notes
```

Each user has a unique API key generated when the user is created. The key is stored in `graph-memory.yaml` under `users.<id>.apiKey`.

## MCP authentication

MCP endpoints at `/mcp/{projectId}` support two authentication methods.

### API key

For clients that support custom request headers -- Claude Code, Cursor, Windsurf -- include your API key directly:

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

### OAuth 2.0 flows

Graph Memory supports two OAuth 2.0 grant types for AI chat clients.

#### client_credentials

The `client_credentials` grant is the simplest option for clients that support it. No browser redirect is required and the entire flow is automated.

The client credentials map to your user config:

| OAuth field | Value |
|-------------|-------|
| Client ID | your `userId` (e.g., `alice`) |
| Client Secret | your `apiKey` (e.g., `mgm-abc123...`) |

Flow:

1. The client posts to `POST /api/oauth/token` with `grant_type=client_credentials`, client ID, and client secret
2. The server validates the credentials and returns a short-lived access token (JWT, type `oauth_access`)
3. The client uses the token as a `Bearer` value in the `Authorization` header for all MCP requests
4. When the token expires, the server responds with `WWW-Authenticate: Bearer` on a `401` response; the client fetches a new token automatically and retries

#### Authorization Code + PKCE

For browser-based OAuth clients (including Claude.ai), Graph Memory also supports the Authorization Code flow with PKCE (`S256`). This flow uses your existing UI session -- if you are already logged in, no re-authentication is required.

Flow:

1. The client opens `GET /ui/auth/authorize` with `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, and `code_challenge_method=S256` as query parameters
2. If the user has an active UI session they see a **consent page** where they can approve the request; otherwise they sign in first
3. After approval, the frontend posts to `POST /api/oauth/authorize` and receives a `{ redirectUrl }` JSON response, then redirects the browser to the client's `redirect_uri` with an authorization code
4. The client exchanges the code at `POST /api/oauth/token` with `grant_type=authorization_code` and the `code_verifier`
5. The server returns an access token (type `oauth_access`) and a refresh token (type `oauth_refresh`)
6. The client can refresh the access token via `POST /api/oauth/token` with `grant_type=refresh_token`

The OAuth discovery document at `GET /.well-known/oauth-authorization-server` advertises both flows.

#### Token types

| JWT `type` field | Issued by | Purpose |
|-----------------|-----------|---------|
| `oauth_access` | Both grant types | Short-lived bearer token for API/MCP requests |
| `oauth_refresh` | Authorization Code flow | Long-lived token used to obtain new access tokens via `refresh_token` grant |

Requirements for both flows:

- `jwtSecret` must be set in your `graph-memory.yaml` (see [JWT secret](#jwt-secret))
- The server must be reachable at a public HTTPS URL

When no users are configured, MCP endpoints remain open -- no credentials needed.

## Connecting Claude.ai

Claude.ai connects to Graph Memory using its "Add custom connector" dialog, which uses the **OAuth 2.0 Authorization Code + PKCE** flow.

1. In Claude.ai, open **Settings > Connectors** and click **Add custom connector**
2. Enter the MCP server URL:

   ```
   https://yourserver.com/mcp/your-project
   ```

3. Claude.ai will redirect you to the Graph Memory consent page at `/ui/auth/authorize`. If you are not already logged in, you will be taken to the login page first.
4. After approving on the consent page, Claude.ai receives an authorization code and exchanges it for tokens automatically.
5. The connection is established. Claude.ai will use refresh tokens to maintain the session without requiring you to re-approve.

Two requirements must be met before connecting:

- The server must be accessible at a **public HTTPS URL** (localhost will not work)
- `jwtSecret` must be configured in `graph-memory.yaml`:

  ```yaml
  server:
    jwtSecret: "your-secret-key-here"
  ```

  Generate a strong secret with: `openssl rand -base64 32`

If your Claude.ai version still uses the older connector dialog with explicit Client ID and Client Secret fields, use `client_credentials` instead: set Client ID to your `userId` and Client Secret to your `apiKey` from `graph-memory.yaml`. See [OAuth 2.0 flows → client_credentials](#client_credentials) above.

## Auth middleware priority

When a request arrives, the server checks credentials in this order:

1. **JWT cookie** -- if a `jwtSecret` is configured, check the `mgm_access` cookie
2. **Bearer token** -- check the `Authorization: Bearer` header; accepts both API keys (`mgm-...`) and OAuth access tokens (JWT type `oauth_access`)
3. **Anonymous** -- if neither is present, the request uses `server.defaultAccess` permissions

The first successful match determines the user identity for the request.

Note: OAuth refresh tokens (type `oauth_refresh`) are only accepted at `POST /api/oauth/token`. They cannot be used as Bearer tokens for API or MCP requests.

## Password security

Passwords are hashed using Node.js `crypto.scrypt` with these parameters:

- **N** = 65536, **r** = 8, **p** = 1, **keylen** = 64
- A random 16-byte salt per password
- Verification uses `crypto.timingSafeEqual` to prevent timing attacks

The hash format is: `$scrypt$N$r$p$salt$hash`

No external dependencies are used for password hashing.
