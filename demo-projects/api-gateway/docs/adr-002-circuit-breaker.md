# ADR-002: Circuit Breaker Pattern for Downstream Services

**Status:** Accepted
**Date:** 2024-01-12
**Authors:** ShopFlow Platform Team

## Context

The API Gateway forwards requests to three downstream services: Catalog, Orders, and Payments. When a downstream service becomes unhealthy (slow responses, errors, or complete outage), the gateway must handle the failure gracefully rather than:

1. Tying up gateway threads waiting for timeouts
2. Overwhelming the failing service with retry storms
3. Propagating failures to healthy services (cascade failure)
4. Returning slow responses to clients who could get a fast error instead

The gateway needs a fault isolation mechanism that detects failures, stops sending requests to unhealthy services, and automatically recovers when services come back online.

## Decision

We implement the **Circuit Breaker pattern** with three states per downstream service: Closed, Open, and Half-Open.

### State Machine

```
                 failure count
                 >= threshold
    ┌────────┐ ──────────────▶ ┌────────┐
    │ CLOSED │                 │  OPEN  │
    │        │ ◀────────────── │        │
    └────────┘   enough        └────┬───┘
        ▲        successes in       │
        │        half-open          │ reset timeout
        │                           │ elapsed
        │       ┌───────────┐       │
        └───────│ HALF-OPEN │◀──────┘
          all   │           │
          probe └───────────┘
          succeed    │
                     │ any probe fails
                     ▼
                ┌────────┐
                │  OPEN  │
                └────────┘
```

### Configuration Per Service

Each downstream service has independent circuit breaker settings:

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;   // Failures before opening (default: 5)
  resetTimeout: number;       // Ms before trying half-open (default: 30000)
  halfOpenRequests: number;   // Probe requests in half-open (default: 2)
}
```

Default configuration by service criticality:

| Service  | Failure Threshold | Reset Timeout | Half-Open Probes |
|----------|-------------------|---------------|------------------|
| Catalog  | 5                 | 30s           | 2                |
| Orders   | 5                 | 30s           | 2                |
| Payments | 3                 | 60s           | 1                |

Payments has a lower threshold and longer reset timeout because payment failures are more critical and the service needs more recovery time.

### Behavior by State

**Closed (normal operation):**
- All requests are forwarded to the downstream service
- Failures increment the failure counter
- Successes reset the failure counter
- When failures reach `failureThreshold`, transition to Open

**Open (circuit tripped):**
- All requests immediately return `503 Service Unavailable`
- No requests are sent to the downstream service
- A timer starts for `resetTimeout` milliseconds
- When the timer expires, transition to Half-Open

**Half-Open (testing recovery):**
- A limited number of probe requests (`halfOpenRequests`) are forwarded
- If all probes succeed, transition to Closed (recovered)
- If any probe fails, transition back to Open (still unhealthy)

### Error Response

When a circuit is open, clients receive a fast 503 response:

```json
{
  "status": 503,
  "error": "Service \"payments\" is temporarily unavailable (circuit open)",
  "correlationId": "req_abc123",
  "duration": 1
}
```

This is preferable to waiting for a timeout (which could be 3-5 seconds).

## Implementation

The circuit breaker is implemented in the routing service:

```typescript
// src/services/routing-service.ts
import { CircuitState } from '../services/routing-service';

// Check before forwarding
if (!isCircuitAllowed(service.name)) {
  return { status: 503, error: 'Circuit open' };
}

// Record outcome after forwarding
try {
  const response = await forward(request, service);
  recordSuccess(service.name);
  return response;
} catch (err) {
  recordFailure(service.name);
  return { status: 502, error: err.message };
}
```

The proxy controller in `src/controllers/proxy-controller.ts` integrates the circuit breaker check before every forwarded request.

## Consequences

### Positive

- **Fast failure** — Clients get immediate 503 instead of waiting for timeouts
- **Failure isolation** — A failing Payments service does not affect Catalog or Orders
- **Automatic recovery** — Half-Open state probes the service without manual intervention
- **Visibility** — Circuit states are exposed via `/health` endpoint for monitoring
- **Independent tuning** — Each service has its own thresholds based on criticality

### Negative

- **False positives** — Transient network issues may trip the circuit unnecessarily
- **State is per-instance** — Each gateway instance has its own circuit state; one instance may have an open circuit while another is closed
- **No partial degradation** — The circuit is binary (allowed/blocked), no gradual reduction

### Mitigations

- **Threshold tuning** — `failureThreshold: 5` requires sustained failures, not single errors
- **Short reset timeout** — 30s is short enough that transient issues resolve before the first probe
- **Health endpoint visibility** — `/health` returns all circuit states for dashboards and alerts

## Alternatives Considered

### Retry-Only (No Circuit Breaker)

Simple retry logic (1-2 retries with exponential backoff). Rejected because retries still send requests to a failing service, and multiple clients retrying simultaneously creates a thundering herd.

### Library-Based (opossum, cockatiel)

Using an established circuit breaker library. Considered but rejected for v1 to keep dependencies minimal. The implementation is simple (~120 lines in `routing-service.ts`). We may adopt `opossum` later if we need features like fallback functions, event listeners, or Prometheus metrics.

### Service Mesh (Istio, Linkerd)

Circuit breaking at the infrastructure layer. Rejected as overkill for the current deployment size (3 services). If ShopFlow grows to 10+ services, we would reconsider a service mesh approach.

## Related Documents

- [deployment.md](deployment.md) — Health check configuration
- [api-reference.md](api-reference.md) — Proxy endpoint documentation
- [rate-limiting.md](rate-limiting.md) — Another fault-tolerance mechanism at the client level
- `src/services/routing-service.ts` — Circuit breaker implementation
- `src/controllers/proxy-controller.ts` — Integration with request forwarding
- `src/controllers/health-controller.ts` — Circuit state exposure via health endpoint
