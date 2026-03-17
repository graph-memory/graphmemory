# ADR-007: Real-Time Updates Strategy

**Status:** Accepted
**Date:** 2024-11-15
**Decision Makers:** Frontend Team, Platform Team
**Supersedes:** None

## Context

The ShopFlow Admin Panel needs to display near real-time order updates so that operations staff can monitor incoming orders, status changes, and fulfillment progress without manually refreshing the page.

Three approaches were evaluated:

1. **Polling** — Client periodically fetches the latest data from the API
2. **WebSocket** — Persistent bidirectional connection for server-pushed updates
3. **Server-Sent Events (SSE)** — Unidirectional server-to-client stream over HTTP

### Requirements

- Order list must reflect new orders within 30 seconds of creation
- Status changes must appear within 15 seconds
- Solution must work behind corporate proxies and firewalls
- Must support 50-200 concurrent admin panel sessions
- Should not significantly increase backend infrastructure complexity
- Must degrade gracefully if the real-time channel is unavailable

## Decision

We chose **polling with a 15-second interval** for the initial implementation.

## Rationale

### Why Polling

**Simplicity.** Polling requires no additional infrastructure. The existing REST API endpoints serve both initial page loads and subsequent polls. There is no need for a WebSocket server, connection management, reconnection logic, or message serialization protocol.

**Proxy compatibility.** Many ShopFlow customers operate behind corporate proxies that may terminate long-lived connections (WebSocket, SSE). Polling uses standard HTTP requests that work universally.

**Predictable load.** With polling, the server load is proportional to the number of active sessions multiplied by the poll frequency. For 200 sessions at 15-second intervals, that is approximately 13 requests per second — well within the capacity of the existing API infrastructure.

**Adequate latency.** The 15-second polling interval satisfies the 30-second requirement for new orders and the 15-second requirement for status changes in the average case (average latency = interval / 2 = 7.5 seconds).

### Why Not WebSocket

WebSocket would provide sub-second update latency, but introduces significant complexity:

- Requires a WebSocket server (or upgrade to the existing HTTP server)
- Connection lifecycle management (connect, disconnect, reconnect with exponential backoff)
- Message protocol design (JSON frames, event types, acknowledgments)
- State synchronization on reconnect (what did the client miss?)
- Load balancer configuration (sticky sessions or shared state)
- Monitoring and debugging tools for persistent connections

For the current scale (50-200 sessions) and latency requirements (15-30 seconds), this complexity is not justified.

### Why Not SSE

Server-Sent Events are simpler than WebSocket (no bidirectional communication needed) and provide server push over HTTP. However:

- Limited browser connection pool (6 connections per domain in HTTP/1.1)
- Some corporate proxies buffer SSE streams, defeating the purpose
- No built-in binary support (not needed now, but limits future flexibility)
- Connection management is still more complex than polling

SSE would be a reasonable middle ground if polling proves insufficient, but we do not expect to need it at current scale.

## Implementation Details

### Polling Architecture

```
┌─────────────┐     GET /orders?page=1     ┌─────────────┐
│  Admin UI   │ ──────── every 15s ──────→ │   REST API  │
│  (useOrders)│ ←──────── JSON ──────────── │  /orders    │
└─────────────┘                            └─────────────┘
```

The `useOrders` hook manages the polling loop:

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchOrders(true); // silent=true skips loading indicator
  }, pollInterval);
  return () => clearInterval(interval);
}, [fetchOrders, pollInterval]);
```

Key implementation choices:

- **Silent refresh** — Poll fetches do not show a loading spinner. Only the initial load and explicit refreshes show loading state
- **Same endpoint** — Polls hit the same `/orders` endpoint as the initial load, with the same pagination and filter parameters
- **No diff** — The full page of results is replaced on each poll. This is simpler than tracking diffs and the payload is small (20 orders per page)
- **Pause on hidden** — Polling pauses when the browser tab is not visible (via `document.visibilityState`) to save bandwidth

### Polling Interval Configuration

The interval is configurable via environment variable:

```
REACT_APP_POLL_INTERVAL=15000  # milliseconds
```

Different intervals may be appropriate for different deployments:

| Scenario | Recommended Interval |
|----------|---------------------|
| High-volume store (1000+ orders/day) | 10 seconds |
| Medium-volume store | 15 seconds (default) |
| Low-volume store | 30 seconds |
| Demo/development | 5 seconds |

## Consequences

### Positive

- Zero additional infrastructure required
- Works universally behind all proxies and firewalls
- Easy to understand, debug, and monitor
- Graceful degradation — if a poll fails, the next one retries automatically
- No state synchronization issues

### Negative

- 15-second average latency (7.5s average, 15s worst case) for updates
- Unnecessary requests when no data has changed (wasted bandwidth)
- Server load scales linearly with session count and poll frequency

### Risks

- If admin session count grows beyond 500, the poll load (~33 req/s) may require API scaling
- Users may perceive the 15-second delay as "not real-time" for time-sensitive operations

## Future Migration Path

If real-time latency requirements tighten or session count grows significantly, we can migrate to WebSocket:

1. Add a WebSocket server alongside the REST API
2. Keep polling as a fallback for clients that cannot establish WebSocket connections
3. Use the WebSocket channel for push notifications (new order, status change)
4. Client subscribes to relevant channels on connect
5. On reconnect, client fetches the full state via REST to catch up

This migration can be done incrementally — the polling infrastructure stays in place and WebSocket is layered on top.

## Review Date

Re-evaluate this decision when:
- Concurrent admin sessions exceed 300
- Real-time latency requirement drops below 5 seconds
- The platform adds features requiring bidirectional communication (e.g., live chat, collaborative editing)
