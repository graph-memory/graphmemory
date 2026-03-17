# Order State Machine

The order lifecycle is modeled as a finite state machine with well-defined transitions. Every order starts in `pending` and moves through a series of states until it reaches a terminal state (`completed`, `cancelled`, or `refunded`).

## State Diagram

```
                    ┌──────────┐
                    │ Pending  │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
               ┌────│ Confirmed│────┐
               │    └────┬─────┘    │
               │         │          │
               │    ┌────▼─────┐    │
               │    │Processing│────┤
               │    └────┬─────┘    │
               │         │          │
               │    ┌────▼─────┐    │
               │    │ Shipped  │    │
               │    └────┬─────┘    │
               │         │          │
               │    ┌────▼─────┐    │
               │    │Delivered │    │
               │    └──┬───┬───┘    │
               │       │   │        │
         ┌─────▼───┐   │   │  ┌────▼─────┐
         │Cancelled│   │   └──│ Refunded │
         └─────────┘   │      └──────────┘
                  ┌────▼─────┐
                  │Completed │───► Refunded
                  └──────────┘
```

## States

| State | Description | Terminal |
|-------|-------------|----------|
| `pending` | Order created, awaiting payment confirmation | No |
| `confirmed` | Payment authorized, order accepted | No |
| `processing` | Order being prepared for shipment | No |
| `shipped` | Package handed off to carrier | No |
| `delivered` | Carrier confirmed delivery | No |
| `completed` | Customer accepted, return window closed | Yes* |
| `cancelled` | Order cancelled before shipment | Yes |
| `refunded` | Full refund processed | Yes |

*Completed orders can still transition to `refunded` if a post-delivery refund is approved.

## Transition Rules

The `isValidTransition()` function in `src/models/order.ts` enforces these rules:

```typescript
const STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  ['completed', 'refunded'],
  completed:  ['refunded'],
  cancelled:  [],
  refunded:   [],
};
```

### Cancellation Flow

Orders can be cancelled at any point before shipping:

1. **Pending** — No payment captured, immediate cancellation
2. **Confirmed** — Payment authorized but not captured; void the authorization
3. **Processing** — Payment captured; cancel triggers automatic refund via the [saga pattern](./adr-006-order-saga.md)

Once an order reaches `shipped`, cancellation is no longer possible. The customer must wait for delivery and request a return/refund.

### Refund Flow

Refunds are handled through a separate approval workflow:

1. Customer or support agent creates a refund request via `POST /refunds`
2. Request enters `pending` status
3. Admin approves via `POST /refunds/:id/approve`
4. Payment service processes the refund against the original charge
5. Order transitions to `refunded`

Partial refunds are supported — the order status changes to `refunded` only when the full amount is refunded. See [Payment Integration](./payment-integration.md) for gateway-level details.

## Side Effects

State transitions trigger the following side effects through the [notification service](../src/services/notification-service.ts):

| Transition | Side Effect |
|-----------|-------------|
| `pending` → `confirmed` | Send order confirmation email |
| `processing` → `shipped` | Send shipping notification with tracking |
| `shipped` → `delivered` | Send delivery confirmation |
| `* → cancelled` | Send cancellation notice, void/refund payment |
| `* → refunded` | Send refund confirmation email |

## Implementation

The state machine is implemented in two layers:

1. **Model layer** (`src/models/order.ts`) — Pure validation via `isValidTransition()`
2. **Service layer** (`src/services/order-service.ts`) — `transitionOrder()` applies the transition and returns the updated order

Controllers call `transitionOrder()` and receive either a success result with the updated order or a failure result with an error message. This separation keeps business rules testable without HTTP concerns.

## Concurrency

In a distributed environment, state transitions must be protected against race conditions. The recommended approach is optimistic locking with a version field:

```typescript
// Pseudocode for concurrent-safe transition
const order = await db.findById(orderId);
const result = transitionOrder(order, targetStatus);
if (!result.success) throw new Error(result.error);
await db.updateWhere({ id: orderId, version: order.version }, result.order);
```

See [ADR-006: Order Saga](./adr-006-order-saga.md) for the distributed coordination pattern.
