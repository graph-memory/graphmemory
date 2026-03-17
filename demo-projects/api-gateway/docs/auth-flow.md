# Authentication Flow

The ShopFlow API Gateway uses a hybrid JWT + server-side session approach for authentication. This document describes the complete authentication lifecycle, JWT structure, refresh token rotation, and session management.

See [adr-001-jwt-vs-sessions.md](adr-001-jwt-vs-sessions.md) for the architectural rationale behind this design.

## Flow Diagram

```
Client                    Gateway                    Auth Service
  │                         │                            │
  │  POST /auth/login       │                            │
  │  {email, password}      │                            │
  │────────────────────────▶│                            │
  │                         │  verify credentials        │
  │                         │───────────────────────────▶│
  │                         │                            │
  │                         │  create session            │
  │                         │◀───────────────────────────│
  │                         │                            │
  │                         │  sign JWT + refresh token  │
  │                         │◀───────────────────────────│
  │                         │                            │
  │  {accessToken,          │                            │
  │   refreshToken,         │                            │
  │   expiresIn}            │                            │
  │◀────────────────────────│                            │
  │                         │                            │
  │  GET /catalog/products  │                            │
  │  Authorization: Bearer  │                            │
  │────────────────────────▶│                            │
  │                         │  verify JWT signature      │
  │                         │  validate session          │
  │                         │  check rate limit          │
  │                         │  forward to catalog        │
  │                         │                            │
  │  {products: [...]}      │                            │
  │◀────────────────────────│                            │
```

## JWT Structure

Access tokens are signed JWTs with the following payload:

```json
{
  "sub": "a1b2c3d4e5f6",
  "email": "user@example.com",
  "role": "customer",
  "sessionId": "sess_abc123def456",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### Payload Fields

| Field       | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `sub`       | string | User ID (unique identifier)                      |
| `email`     | string | User's email address                             |
| `role`      | enum   | One of: `customer`, `admin`, `merchant`, `support`|
| `sessionId` | string | Server-side session ID for revocation             |
| `iat`       | number | Issued-at timestamp (Unix seconds)               |
| `exp`       | number | Expiration timestamp (Unix seconds)              |

### Token Lifetimes

| Token Type    | Default TTL | Environment Variable     |
|---------------|-------------|--------------------------|
| Access Token  | 15 minutes  | `JWT_EXPIRES_IN`         |
| Refresh Token | 7 days      | `REFRESH_EXPIRES_IN`     |
| Session       | 24 hours    | `SESSION_TTL`            |

## Refresh Token Rotation

Refresh tokens are single-use opaque hex strings. When a client uses a refresh token, the gateway:

1. Validates the refresh token against the internal store
2. Deletes the consumed refresh token (preventing reuse)
3. Verifies the associated session is still active
4. Issues a new access token + new refresh token pair
5. Returns the new pair to the client

```bash
# Refresh an expired access token
curl -X POST http://localhost:4000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "a1b2c3..."}'

# Response
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "d4e5f6...",
  "expiresIn": 900
}
```

### Replay Detection

If a refresh token is used twice, the second attempt fails because the token was consumed on first use. This protects against token theft — if an attacker replays a stolen refresh token, the legitimate user's next refresh also fails, signaling compromise.

## Session Management

Server-side sessions provide immediate revocation capability. Even if a JWT is technically valid (not expired, valid signature), it will be rejected if the associated session has been destroyed.

### Session Lifecycle

1. **Created** on successful login — stored in memory with user ID, role, IP, user-agent
2. **Validated** on every authenticated request — `lastAccessedAt` updated
3. **Destroyed** on logout — the user's access token is also revoked
4. **Expired** after `SESSION_TTL` — cleaned up by periodic garbage collection (every 60s)

### Active Session Listing

Users can view their active sessions for security auditing:

```bash
curl http://localhost:4000/auth/sessions \
  -H "Authorization: Bearer <access_token>"
```

## Logout

Logout performs two actions simultaneously:

1. **Revokes the access token** — adds its fingerprint (SHA-256 hash) to a revocation set
2. **Destroys the session** — removes it from the session store

After logout, the access token is immediately unusable even if it hasn't expired.

```bash
curl -X POST http://localhost:4000/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

## Public Endpoints

The following paths bypass authentication entirely:

- `POST /auth/login` — Login
- `POST /auth/register` — Registration
- `GET /health` — Health summary
- `GET /health/ready` — Readiness probe
- `GET /health/live` — Liveness probe

All other paths require a valid `Authorization: Bearer <token>` header.

## Security Considerations

- Passwords are hashed with iterated SHA-256 (production should use bcrypt/argon2)
- JWT signatures use HMAC-SHA256 with a server-side secret
- Refresh tokens are stored as SHA-256 hashes (the plaintext is never persisted)
- Timing-safe comparison is used for all credential verification
- Sessions bind to IP + user-agent for anomaly detection
