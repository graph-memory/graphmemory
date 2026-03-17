# ADR-005: Payment Idempotency Keys

## Status

Accepted

## Date

2025-11-15

## Context

Payment operations are inherently risky when it comes to duplicate execution. Network failures, client retries, and load balancer timeouts can all cause a single payment intent to be submitted multiple times. Without protection, this results in double-charging the customer.

The Order Service needs a strategy to ensure that:

1. A payment for a given order is charged exactly once
2. Retries of failed requests do not create duplicate charges
3. Deliberate re-attempts (e.g., after a declined card is replaced) are allowed

### Considered Approaches

**Option A: Client-generated UUID**
The frontend generates a unique UUID for each payment attempt and includes it in the request. The server deduplicates based on this key.

- Pro: Simple to implement
- Con: Client can generate new UUIDs, bypassing idempotency
- Con: No way to distinguish retry from intentional re-attempt

**Option B: Server-generated deterministic key**
The server generates an idempotency key from the order ID and a time bucket. Requests within the same bucket are considered retries; requests in a new bucket are considered new attempts.

- Pro: Server controls deduplication logic
- Pro: Automatically allows re-attempts after a time window
- Con: Slightly more complex key generation

**Option C: Database-level unique constraint**
Use a unique constraint on `(order_id, status=pending)` to prevent duplicate pending payments.

- Pro: Database-enforced guarantee
- Con: Doesn't prevent duplicate API calls to Stripe
- Con: Race conditions between check and insert

## Decision

We chose **Option B: Server-generated deterministic key** with a 1-minute time bucket.

### Key Generation

```typescript
function generateIdempotencyKey(orderId: string, attemptTimestamp: Date): string {
  const bucket = Math.floor(attemptTimestamp.getTime() / 60000);
  return `pay_${orderId}_${bucket}`;
}
```

The key is passed to Stripe's `Idempotency-Key` header, which guarantees at-most-once execution for any given key within 24 hours.

### Flow

```
Client → POST /payments { orderId: "ord_123" }
Server → generateIdempotencyKey("ord_123", now) → "pay_ord_123_28500000"
Server → Stripe.paymentIntents.create({ ..., idempotencyKey: "pay_ord_123_28500000" })
```

If the same request is retried within the same 1-minute window:
- Same idempotency key is generated
- Stripe returns the cached response (no duplicate charge)

If the customer deliberately retries after the window:
- New time bucket → new idempotency key
- Stripe processes as a new payment intent
- Previous intent (if any) is voided during reconciliation

## Consequences

### Positive

- Double-charge prevention without client-side coordination
- Automatic retry safety for network failures and timeouts
- Compatible with Stripe's native idempotency mechanism
- Deterministic keys simplify debugging (key can be reconstructed from order ID + timestamp)

### Negative

- 1-minute bucket means a retry after 60 seconds may be treated as a new attempt
- Requires reconciliation job to void orphaned authorizations (see [Payment Integration](./payment-integration.md))
- Not applicable to non-Stripe payment methods without adaptation

### Risks

- Time-bucket boundary edge cases: a request at 11:59:59 and a retry at 12:00:01 will generate different keys. Mitigation: the reconciliation job catches these within 10 minutes.
- Clock skew between server instances could affect bucket alignment. Mitigation: use NTP-synchronized clocks and keep buckets coarse (1 minute).

## Implementation

- Key generation: `src/models/payment.ts` — `generateIdempotencyKey()`
- Payment initiation: `src/services/payment-service.ts` — `initiatePayment()`
- Controller: `src/controllers/payment-controller.ts` — `handleInitiatePayment()`

## Related

- [Payment Integration Guide](./payment-integration.md)
- [Order State Machine](./order-state-machine.md)
- [ADR-006: Order Saga Pattern](./adr-006-order-saga.md)
