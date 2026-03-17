# ShopFlow API Gateway

The API Gateway is the single entry point for all client requests to the ShopFlow e-commerce platform. It handles authentication, request routing, rate limiting, and health monitoring for the microservice architecture.

## Architecture Overview

```
┌─────────┐     ┌──────────────────────────────────────────┐
│  Client  │────▶│            API Gateway (:4000)            │
└─────────┘     │                                          │
                │  ┌─────────┐ ┌──────────┐ ┌───────────┐ │
                │  │  Auth   │ │  Rate    │ │  CORS     │ │
                │  │  Guard  │ │  Limiter │ │  Handler  │ │
                │  └────┬────┘ └────┬─────┘ └─────┬─────┘ │
                │       └───────────┼─────────────┘       │
                │              ┌────▼─────┐               │
                │              │  Router  │               │
                │              └────┬─────┘               │
                └───────────────────┼──────────────────────┘
                       ┌────────────┼────────────┐
                       ▼            ▼            ▼
                ┌──────────┐ ┌──────────┐ ┌──────────┐
                │ Catalog  │ │  Orders  │ │ Payments │
                │  :4001   │ │  :4002   │ │  :4003   │
                └──────────┘ └──────────┘ └──────────┘
```

## Features

- **JWT Authentication** — Hybrid JWT + server-side session approach for both stateless verification and immediate revocation. See [auth-flow.md](auth-flow.md).
- **Request Routing** — Path-based service discovery with configurable upstream URLs. Requests to `/catalog/*` are forwarded to the Catalog service, `/orders/*` to Orders, etc.
- **Rate Limiting** — Token bucket algorithm with per-IP and per-user limits. Tiered quotas for anonymous, customer, merchant, and admin roles. See [rate-limiting.md](rate-limiting.md).
- **Circuit Breaker** — Automatic failure detection and recovery for downstream services. Prevents cascade failures. See [adr-002-circuit-breaker.md](adr-002-circuit-breaker.md).
- **Health Checks** — Kubernetes-compatible `/health`, `/health/ready`, and `/health/live` endpoints.
- **CORS** — Configurable allowed origins with preflight handling.
- **Structured Logging** — JSON log output with correlation IDs for distributed tracing.

## Quick Start

### Prerequisites

- Node.js 20+
- TypeScript 5.3+
- Downstream services running (catalog, orders, payments)

### Installation

```bash
npm install
npm run build
```

### Configuration

Set environment variables or use defaults for local development:

```bash
export PORT=4000
export JWT_SECRET=your-secret-here
export SERVICE_CATALOG_URL=http://localhost:4001
export SERVICE_ORDERS_URL=http://localhost:4002
export SERVICE_PAYMENTS_URL=http://localhost:4003
```

See [deployment.md](deployment.md) for the full variable reference.

### Running

```bash
# Development
npm run dev

# Production
node dist/index.js
```

### Testing Authentication

```bash
# Register a new user
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secure123"}'

# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secure123"}'

# Use the access token for authenticated requests
curl http://localhost:4000/catalog/products \
  -H "Authorization: Bearer <access_token>"
```

## Project Structure

```
src/
├── config/          # Environment-based configuration loader
├── controllers/     # HTTP endpoint handlers
│   ├── auth-controller.ts      # Login, register, logout, refresh
│   ├── proxy-controller.ts     # Downstream request forwarding
│   ├── health-controller.ts    # Health probes
│   └── rate-limit-controller.ts # Rate limit status
├── middleware/       # Request processing pipeline
│   ├── auth-guard.ts           # JWT validation + session check
│   ├── rate-limiter.ts         # Token bucket implementation
│   ├── cors-middleware.ts      # CORS headers + preflight
│   └── logging-middleware.ts   # Structured JSON logging
├── services/        # Business logic layer
│   ├── auth-service.ts         # Authentication orchestration
│   ├── routing-service.ts      # Service registry + circuit breaker
│   ├── session-service.ts      # Server-side session store
│   └── token-service.ts        # JWT sign/verify/revoke
├── types/           # Shared TypeScript interfaces
└── utils/           # Cryptographic helpers
```

## API Reference

See [api-reference.md](api-reference.md) for the complete endpoint documentation with request/response examples.

## Architecture Decisions

- [ADR-001: JWT vs Sessions](adr-001-jwt-vs-sessions.md) — Why we use a hybrid approach
- [ADR-002: Circuit Breaker](adr-002-circuit-breaker.md) — Fault tolerance for downstream services
