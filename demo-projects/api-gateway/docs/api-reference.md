# API Reference

Complete endpoint reference for the ShopFlow API Gateway. All request and response bodies use JSON. Authentication is via Bearer token unless otherwise noted.

See [auth-flow.md](auth-flow.md) for the authentication lifecycle and [rate-limiting.md](rate-limiting.md) for quota details.

## Authentication Endpoints

### POST /auth/register

Creates a new user account. This is a public endpoint (no authentication required).

**Request:**

```json
{
  "email": "merchant@shopflow.com",
  "password": "SecurePass123!",
  "role": "merchant"
}
```

**Response (201 Created):**

```json
{
  "status": 201,
  "data": {
    "id": "a1b2c3d4e5f6",
    "email": "merchant@shopflow.com",
    "role": "merchant",
    "createdAt": "2024-01-15T10:30:00Z",
    "lastLoginAt": null
  },
  "correlationId": "req_abc123"
}
```

**Errors:**
- `400` — Missing email or password
- `409` — Email already registered

### POST /auth/login

Authenticates a user and returns a JWT access token + refresh token pair. Creates a server-side session for immediate revocation support.

**Request:**

```json
{
  "email": "merchant@shopflow.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**

```json
{
  "status": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c...",
    "expiresIn": 900
  },
  "correlationId": "req_def456"
}
```

**Errors:**
- `400` — Missing email or password
- `401` — Invalid credentials

### POST /auth/refresh

Rotates the refresh token and issues a new access token. The old refresh token is consumed (single-use). See [auth-flow.md](auth-flow.md) for the rotation mechanism.

**Request:**

```json
{
  "refreshToken": "7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c..."
}
```

**Response (200 OK):**

```json
{
  "status": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "new_token_here...",
    "expiresIn": 900
  },
  "correlationId": "req_ghi789"
}
```

**Errors:**
- `400` — Missing refresh token
- `401` — Invalid, expired, or already-used refresh token

### POST /auth/logout

Revokes the current access token and destroys the server-side session. Requires authentication.

**Request:** No body required. The access token is extracted from the Authorization header.

**Response (200 OK):**

```json
{
  "status": 200,
  "data": { "message": "Logged out successfully" },
  "correlationId": "req_jkl012"
}
```

## Proxy Endpoints

All paths not matching `/auth/*`, `/health/*`, or `/rate-limit/*` are forwarded to downstream services based on the first path segment.

### GET/POST/PUT/DELETE /{service}/{path}

Routes requests to the matching downstream service. Requires authentication.

| Path Prefix   | Downstream Service | Default URL           |
|---------------|-------------------|-----------------------|
| `/catalog/*`  | Catalog Service   | `http://localhost:4001` |
| `/orders/*`   | Orders Service    | `http://localhost:4002` |
| `/payments/*` | Payments Service  | `http://localhost:4003` |

**Example:**

```bash
# Get product catalog
curl http://localhost:4000/catalog/products \
  -H "Authorization: Bearer <token>"

# Create an order
curl -X POST http://localhost:4000/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"productId": "p1", "quantity": 2}]}'
```

**Errors:**
- `404` — No service registered for the path prefix
- `502` — Upstream service error
- `503` — Circuit breaker open (service temporarily unavailable)

## Health Endpoints

All health endpoints are public (no authentication required). See [deployment.md](deployment.md) for Kubernetes probe configuration.

### GET /health

Returns a comprehensive health summary including downstream service status.

**Response (200 OK):**

```json
{
  "status": 200,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 3600,
    "services": [
      { "name": "catalog", "status": "healthy", "circuitState": "closed", "latency": null },
      { "name": "orders", "status": "healthy", "circuitState": "closed", "latency": null },
      { "name": "payments", "status": "degraded", "circuitState": "half-open", "latency": null }
    ],
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### GET /health/ready

Readiness probe. Returns 200 if at least one downstream service is reachable.

### GET /health/live

Liveness probe. Always returns 200 if the process is running.

## Rate Limit Endpoints

### GET /rate-limit/status

Returns the caller's current rate limit status. Does not consume a token.

**Response (200 OK):**

```json
{
  "status": 200,
  "data": {
    "key": "rl:user:a1b2c3d4",
    "tier": "customer",
    "remaining": 87,
    "limit": 100,
    "resetAt": "2024-01-15T10:31:00Z",
    "retryAfter": null,
    "headers": {
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "87",
      "X-RateLimit-Reset": "1705312260"
    }
  }
}
```

### GET /rate-limit/tiers

Returns all available rate limit tier definitions.

## Common Response Headers

Every response from the gateway includes:

| Header                  | Description                          |
|-------------------------|--------------------------------------|
| `X-Correlation-ID`     | Unique request trace ID              |
| `X-RateLimit-Limit`    | Maximum requests per window          |
| `X-RateLimit-Remaining`| Remaining requests in current window |
| `X-RateLimit-Reset`    | Window reset time (Unix timestamp)   |
