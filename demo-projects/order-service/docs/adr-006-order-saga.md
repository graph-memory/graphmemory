# ADR-006: Order Saga Pattern for Distributed Processing

## Status

Accepted

## Date

2025-12-03

## Context

Order fulfillment in the ShopFlow platform involves multiple services that must coordinate to complete an order:

1. **Inventory Service** — Reserve stock for ordered items
2. **Payment Service** — Authorize and capture payment
3. **Shipping Service** — Create shipment and generate label
4. **Notification Service** — Send confirmation to customer

These operations span multiple databases and external APIs. Traditional distributed transactions (2PC) are impractical because:

- External APIs (Stripe, carrier APIs) do not support two-phase commit
- Holding locks across services increases latency and reduces availability
- Failure in one service should not block others indefinitely

We need a pattern that provides eventual consistency while handling partial failures gracefully.

### Considered Approaches

**Option A: Choreography-based saga**
Each service publishes domain events; other services react to those events independently.

- Pro: Loose coupling, no central coordinator
- Con: Difficult to track overall progress
- Con: Complex failure handling (compensating events from multiple sources)
- Con: Hard to reason about ordering guarantees

**Option B: Orchestration-based saga**
A central orchestrator (the Order Service) coordinates the sequence of steps and handles compensation on failure.

- Pro: Single place to understand the full workflow
- Pro: Explicit compensation logic for each step
- Pro: Easy to add monitoring and logging
- Con: Orchestrator becomes a critical dependency
- Con: Slightly tighter coupling to the orchestrator

**Option C: Hybrid approach**
Orchestration for the critical path (inventory → payment → shipping), choreography for non-critical side effects (notifications, analytics).

- Pro: Best of both worlds
- Con: More complex to implement initially

## Decision

We chose **Option C: Hybrid approach** — orchestration for the critical fulfillment path with choreography for non-critical side effects.

### Saga Steps (Orchestrated)

```
Order Created
  │
  ▼
Step 1: Reserve Inventory
  │ (compensate: release inventory)
  ▼
Step 2: Authorize Payment
  │ (compensate: void authorization)
  ▼
Step 3: Capture Payment
  │ (compensate: refund captured amount)
  ▼
Step 4: Create Shipment
  │ (compensate: cancel shipment)
  ▼
Order Confirmed ──► Emit "order.confirmed" event
```

### Compensation Flow

When a step fails, the orchestrator executes compensating actions in reverse order:

```typescript
// Pseudocode for saga execution
async function executeSaga(order: Order): Promise<SagaResult> {
  const inventory = await reserveInventory(order.items);
  if (!inventory.success) {
    return { success: false, error: 'Stock unavailable' };
  }

  const authorization = await authorizePayment(order);
  if (!authorization.success) {
    await releaseInventory(inventory.reservationId);  // compensate step 1
    return { success: false, error: 'Payment authorization failed' };
  }

  const capture = await capturePayment(authorization.paymentId);
  if (!capture.success) {
    await voidAuthorization(authorization.paymentId);  // compensate step 2
    await releaseInventory(inventory.reservationId);   // compensate step 1
    return { success: false, error: 'Payment capture failed' };
  }

  const shipment = await createShipment(order);
  if (!shipment.success) {
    await refundPayment(capture.paymentId, order.total);  // compensate step 3
    await releaseInventory(inventory.reservationId);       // compensate step 1
    return { success: false, error: 'Shipment creation failed' };
  }

  return { success: true, order: { ...order, status: 'confirmed' } };
}
```

### Side Effects (Choreographed)

Non-critical side effects subscribe to domain events:

| Event | Subscribers |
|-------|------------|
| `order.confirmed` | Notification Service, Analytics |
| `order.shipped` | Notification Service, Customer Dashboard |
| `order.cancelled` | Notification Service, Inventory Service |
| `order.refunded` | Notification Service, Accounting |

If a notification fails, the order is not affected. Failed side effects are retried independently with their own retry policies.

## Consequences

### Positive

- Clear understanding of the fulfillment workflow from a single orchestrator
- Explicit compensation logic makes failure handling predictable
- Non-critical side effects don't block the critical path
- Easy to add new steps to the saga (e.g., fraud check) without changing subscribers
- Saga state can be persisted for recovery after crashes

### Negative

- Orchestrator is a single point of failure (mitigated by redundancy)
- Compensating actions may themselves fail (requires dead-letter queue and manual intervention)
- Eventual consistency means the order may be in an intermediate state for a few seconds
- Testing the full saga requires integration tests across multiple services

### Open Questions

- Should the saga state be persisted to a durable store for crash recovery?
- What is the maximum acceptable time for a saga to complete before timing out?
- How do we handle compensating action failures (dead-letter queue vs. manual intervention)?

## Implementation

The saga orchestrator will be implemented in the Order Service as a dedicated `OrderSagaRunner` class. For the initial version, saga state is in-memory; persistence will be added when we move to a message queue (RabbitMQ or Kafka).

### Files

- Saga runner: `src/services/order-service.ts` — `transitionOrder()` triggers the saga
- Payment steps: `src/services/payment-service.ts` — `initiatePayment()`, `processRefund()`
- Shipping steps: `src/services/shipping-service.ts` — `calculateShippingRates()`, `getTracking()`
- Notifications: `src/services/notification-service.ts` — event subscribers

## Related

- [Order State Machine](./order-state-machine.md) — State transitions triggered by saga completion
- [Payment Integration](./payment-integration.md) — Payment authorize/capture/refund flow
- [ADR-005: Payment Idempotency](./adr-005-payment-idempotency.md) — Preventing duplicate charges during retries
