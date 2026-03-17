# ADR-001: Hybrid JWT + Server-Side Sessions

**Status:** Accepted
**Date:** 2024-01-10
**Authors:** ShopFlow Platform Team

## Context

The API Gateway needs an authentication mechanism that supports:

1. **Stateless verification** — Downstream services should validate tokens without calling back to the gateway
2. **Immediate revocation** — Compromised tokens must be invalidated instantly (not just at expiry)
3. **Scalability** — The mechanism should work across multiple gateway instances
4. **Audit trail** — We need to track active sessions per user for security monitoring

Pure JWT authentication is stateless and scalable but cannot support immediate revocation without a blacklist. Pure session-based authentication supports revocation but requires a centralized session store for every request.

## Decision

We adopt a **hybrid approach**: short-lived JWTs for request authentication combined with server-side sessions for revocation and audit.

### How It Works

```
Login:
  1. Verify credentials
  2. Create server-side session (stores userId, role, IP, userAgent)
  3. Sign JWT with sessionId embedded in the payload
  4. Return JWT access token (15min) + opaque refresh token (7 days)

Request:
  1. Verify JWT signature and expiration
  2. Validate the embedded sessionId against the session store
  3. If session is gone → reject (even if JWT is valid)
  4. Update session.lastAccessedAt
  5. Forward request to downstream service

Logout:
  1. Add JWT fingerprint to revocation set
  2. Destroy the server-side session
  3. Both actions happen atomically

Refresh:
  1. Consume the refresh token (single-use)
  2. Validate the associated session
  3. Issue new JWT + new refresh token
```

### Token Structure

Access tokens carry everything needed for downstream authorization:

```typescript
interface AuthPayload {
  sub: string;        // User ID
  email: string;      // User email
  role: Role;         // RBAC role
  sessionId: string;  // Links to server-side session
  iat: number;        // Issued at
  exp: number;        // Expires at (15 min)
}
```

Downstream services can trust the JWT without calling the gateway, but the gateway itself validates the session on every pass-through.

## Consequences

### Positive

- **Best of both worlds** — Stateless downstream verification + immediate revocation at the gateway
- **Short token lifetime** — 15-minute access tokens limit the window of compromise
- **Refresh rotation** — Single-use refresh tokens detect replay attacks
- **Session auditing** — Users can see and terminate active sessions
- **Gradual migration** — We can move sessions to Redis later without changing the JWT contract

### Negative

- **Added complexity** — Two systems to maintain (JWT + sessions) vs. one
- **Memory usage** — In-memory sessions consume RAM (mitigated by TTL + cleanup)
- **Not fully stateless** — The gateway itself is stateful (sessions, revocation set)
- **Clock sensitivity** — JWT expiration depends on synchronized clocks

### Risks

- **Session store loss** — If the gateway restarts, all sessions are lost. Users must re-login. Acceptable for v1; Redis migration planned for v2.
- **Revocation set growth** — Token fingerprints accumulate until the token would have expired naturally. Mitigated by short (15min) TTL — fingerprints can be pruned after expiry.

## Alternatives Considered

### Pure JWT (No Sessions)

Simpler architecture, but no immediate revocation. A stolen token remains valid for its full 15-minute lifetime. Rejected because ShopFlow handles payments — even 15 minutes of unauthorized access is unacceptable.

### Pure Sessions (No JWT)

Every request requires a session lookup. Downstream services cannot verify identity without calling the gateway. Rejected because it creates a single point of failure and adds latency to every inter-service call.

### JWT + Redis Blacklist

Similar to our approach but uses Redis instead of in-memory sessions. Considered overkill for the current scale. We designed the session interface to be swappable — migrating to Redis requires changing only the storage layer in `session-service.ts`.

## Related Documents

- [auth-flow.md](auth-flow.md) — Detailed authentication flow with diagrams
- [api-reference.md](api-reference.md) — Login/register/refresh endpoint docs
- `src/services/token-service.ts` — JWT implementation
- `src/services/session-service.ts` — Session store implementation
- `src/middleware/auth-guard.ts` — Request authentication pipeline
