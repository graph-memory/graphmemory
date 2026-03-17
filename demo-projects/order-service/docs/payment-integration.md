# Payment Integration Guide

The Order Service integrates with Stripe as the primary payment gateway. This guide covers the payment flow, webhook handling, idempotency strategy, and error recovery.

## Payment Flow

```
Customer → Order Service → Stripe API → Webhook → Order Service
   │                                                     │
   └─ POST /payments ──────► Create PaymentIntent ───────┘
                              authorize + capture
```

### Step-by-Step

1. **Checkout** — Customer submits order; frontend collects card details via Stripe Elements
2. **Initiation** — `POST /payments` creates a `Payment` record and calls `initiatePayment()`
3. **Authorization** — Gateway authorizes the card for the full amount
4. **Capture** — For immediate capture, the charge is captured in the same request
5. **Confirmation** — Webhook `payment_intent.succeeded` confirms the transaction
6. **Order Update** — Order transitions from `pending` to `confirmed`

## Stripe Configuration

Required environment variables:

```bash
STRIPE_API_KEY=sk_live_...          # Secret API key
STRIPE_WEBHOOK_SECRET=whsec_...     # Webhook signing secret
STRIPE_PUBLISHABLE_KEY=pk_live_...  # Frontend publishable key
```

## Webhook Handling

The `POST /payments/webhook` endpoint processes Stripe events. All webhooks are signature-verified using the `verifyWebhookSignature()` function in `src/services/payment-service.ts`.

### Supported Events

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Confirm order, send receipt |
| `payment_intent.failed` | Mark payment failed, notify customer |
| `charge.refunded` | Update refund status, notify customer |
| `charge.dispute.created` | Flag order for review |

### Signature Verification

```typescript
import { verifyWebhookSignature } from '@/services/payment-service';

// In the webhook handler
const signature = req.headers['stripe-signature'];
const isValid = verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET);

if (!isValid) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

## Idempotency

All payment operations use idempotency keys to prevent duplicate charges. See [ADR-005](./adr-005-payment-idempotency.md) for the full rationale.

### Key Generation

The `generateIdempotencyKey()` function creates deterministic keys based on the order ID and a 1-minute time bucket:

```typescript
import { generateIdempotencyKey } from '@/models/payment';

const key = generateIdempotencyKey(orderId, new Date());
// Result: "pay_ord_abc123_28500000"
```

This ensures that retries within the same minute window reuse the same key, while a deliberate re-attempt after the window generates a new key.

### Retry Strategy

```
Attempt 1 → key: pay_ord_123_28500000 → 500 Gateway Error
Attempt 2 → key: pay_ord_123_28500000 → Idempotent replay (no duplicate charge)
Attempt 3 → key: pay_ord_123_28500000 → Success
```

## Error Recovery

### Transient Failures

Network timeouts and 5xx errors from Stripe are retried with exponential backoff:

```typescript
const config: PaymentGatewayConfig = {
  apiKey: process.env.STRIPE_API_KEY!,
  baseUrl: 'https://api.stripe.com/v1',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  maxRetries: 3,
  timeoutMs: 10000,
};
```

### Permanent Failures

Card declines, insufficient funds, and fraud flags are not retried. The payment status is set to `failed` and the customer is notified to try a different payment method.

### Orphaned Payments

If the service crashes between authorization and capture, a reconciliation job runs every 5 minutes to:

1. Find payments in `authorized` status older than 10 minutes
2. Attempt capture via the Stripe API
3. If capture fails, void the authorization
4. Update order status accordingly

## Testing

Use Stripe test mode keys and card numbers:

| Card Number | Scenario |
|-------------|----------|
| `4242424242424242` | Successful payment |
| `4000000000009995` | Insufficient funds |
| `4000000000000069` | Expired card |
| `4000000000000127` | Incorrect CVC |

## Supported Payment Methods

The `PaymentMethod` enum in `src/types/index.ts` defines supported methods:

- `credit_card` — Visa, Mastercard, Amex
- `debit_card` — Direct debit cards
- `paypal` — PayPal redirect flow
- `bank_transfer` — ACH / SEPA transfers
- `crypto` — Bitcoin, Ethereum (via third-party processor)

Each method has different authorization and settlement timelines. Credit/debit cards settle immediately; bank transfers may take 2-5 business days.

## Related

- [API Reference — Payments](./api-reference.md#payments)
- [ADR-005: Payment Idempotency](./adr-005-payment-idempotency.md)
- [Order State Machine](./order-state-machine.md)
