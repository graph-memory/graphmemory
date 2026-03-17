# Deployment Guide

This guide covers deploying the ShopFlow API Gateway in production environments, including Docker setup, environment configuration, health check integration, and scaling considerations.

See [README.md](README.md) for development setup and [api-reference.md](api-reference.md) for endpoint documentation.

## Docker Setup

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 4000
USER node
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  api-gateway:
    build: .
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - JWT_SECRET=${JWT_SECRET}
      - SERVICE_CATALOG_URL=http://catalog:4001
      - SERVICE_ORDERS_URL=http://orders:4002
      - SERVICE_PAYMENTS_URL=http://payments:4003
      - CORS_ORIGINS=https://shopflow.com,https://admin.shopflow.com
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4000/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 15s
    depends_on:
      - catalog
      - orders
      - payments
```

## Environment Variables

### Server Configuration

| Variable    | Default     | Description                    |
|-------------|-------------|--------------------------------|
| `PORT`      | `4000`      | HTTP listen port               |
| `HOST`      | `0.0.0.0`  | Bind address                   |
| `LOG_LEVEL` | `info`      | Log verbosity (debug/info/warn/error) |

### Authentication

| Variable             | Default                        | Description                    |
|----------------------|--------------------------------|--------------------------------|
| `JWT_SECRET`         | `dev-secret-change-in-production` | HMAC-SHA256 signing secret |
| `JWT_EXPIRES_IN`     | `900`                          | Access token TTL (seconds)     |
| `REFRESH_EXPIRES_IN` | `604800`                       | Refresh token TTL (seconds)    |
| `SESSION_TTL`        | `86400`                        | Server-side session TTL (seconds) |

> **Warning:** Always set `JWT_SECRET` to a strong random value in production. The default is only for local development.

### Service Discovery

| Variable                   | Default                  | Description              |
|----------------------------|--------------------------|--------------------------|
| `SERVICE_CATALOG_URL`      | `http://localhost:4001`  | Catalog service base URL |
| `SERVICE_ORDERS_URL`       | `http://localhost:4002`  | Orders service base URL  |
| `SERVICE_PAYMENTS_URL`     | `http://localhost:4003`  | Payments service base URL|
| `SERVICE_CATALOG_TIMEOUT`  | `5000`                   | Catalog request timeout (ms) |
| `SERVICE_ORDERS_TIMEOUT`   | `5000`                   | Orders request timeout (ms)  |
| `SERVICE_PAYMENTS_TIMEOUT` | `3000`                   | Payments request timeout (ms)|

### Rate Limiting

| Variable               | Default | Description                    |
|------------------------|---------|--------------------------------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms)         |
| `RATE_LIMIT_MAX`       | `100`   | Max requests per window        |
| `RATE_LIMIT_BURST`     | `20`    | Max burst size                 |

See [rate-limiting.md](rate-limiting.md) for the algorithm details.

### CORS

| Variable       | Default                                       | Description          |
|----------------|-----------------------------------------------|----------------------|
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173`  | Comma-separated list |

## Health Checks

### Kubernetes Probes

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api-gateway
          livenessProbe:
            httpGet:
              path: /health/live
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 15
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 2
```

### Probe Semantics

| Endpoint        | Purpose                | Failure Means                      |
|-----------------|------------------------|------------------------------------|
| `/health/live`  | Process is alive       | Restart the container              |
| `/health/ready` | Can serve traffic      | Remove from load balancer          |
| `/health`       | Full diagnostic        | Dashboard monitoring               |

See [api-reference.md](api-reference.md) for the response format of each endpoint.

## Scaling Considerations

### Horizontal Scaling

The gateway is stateless from a routing perspective, but in-memory stores (sessions, rate limit buckets, token revocation) are not shared across instances. For multi-instance deployments:

1. **Sessions** — Move to Redis or a shared store
2. **Rate limiting** — Use Redis-backed token buckets (e.g., `rate-limiter-flexible`)
3. **Token revocation** — Publish revocation events via Redis pub/sub
4. **Circuit breaker** — Each instance maintains its own circuit state (acceptable)

### Resource Requirements

| Metric     | Development | Production (per instance) |
|------------|-------------|---------------------------|
| CPU        | 0.1 cores   | 0.5 cores                 |
| Memory     | 64 MB       | 256 MB                    |
| Connections| 10          | 1000                      |

### Load Balancer Configuration

Place an L7 load balancer (nginx, AWS ALB) in front of gateway instances:

```nginx
upstream api_gateway {
    least_conn;
    server gateway-1:4000;
    server gateway-2:4000;
    server gateway-3:4000;
}
```

Ensure the load balancer passes `X-Forwarded-For` and `X-Forwarded-Proto` headers for accurate IP-based rate limiting and logging.
