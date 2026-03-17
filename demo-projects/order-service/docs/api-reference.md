# API Reference

Complete endpoint documentation for the ShopFlow Order Service. All endpoints accept and return JSON. Authentication is handled via the API gateway; the `x-customer-id` header identifies the authenticated user.

## Orders

### Create Order

```http
POST /orders
Content-Type: application/json

{
  "customerId": "cust_abc123",
  "customerEmail": "alice@example.com",
  "items": [
    {
      "productId": "prod_001",
      "sku": "WIDGET-BLU-L",
      "name": "Blue Widget (Large)",
      "quantity": 2,
      "unitPrice": 29.99,
      "currency": "USD"
    }
  ],
  "shippingAddress": {
    "line1": "123 Main St",
    "city": "Portland",
    "state": "OR",
    "postalCode": "97201",
    "country": "US"
  },
  "billingAddress": {
    "line1": "123 Main St",
    "city": "Portland",
    "state": "OR",
    "postalCode": "97201",
    "country": "US"
  },
  "shippingCost": 5.99,
  "currency": "USD"
}
```

**Response (201):**
```json
{
  "order": {
    "id": "ord_1710000000_abc123",
    "status": "pending",
    "total": 65.97,
    "items": [...]
  }
}
```

### Get Order

```http
GET /orders/:id
```

Returns the full order object including items, addresses, tax breakdown, and current status. See [Order State Machine](./order-state-machine.md) for status values.

### List Orders

```http
GET /orders?customerId=cust_abc123&status=pending&page=1&limit=20
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `customerId` | string | — | Filter by customer |
| `status` | string | — | Filter by order status |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Results per page (max 100) |

### Cancel Order

```http
POST /orders/:id/cancel
```

Cancels an order. Only orders in `pending`, `confirmed`, or `processing` status can be cancelled. Returns 422 if the transition is invalid.

## Shopping Cart

### Add to Cart

```http
POST /cart/items
x-customer-id: cust_abc123

{
  "productId": "prod_001",
  "sku": "WIDGET-BLU-L",
  "name": "Blue Widget (Large)",
  "unitPrice": 29.99,
  "currency": "USD",
  "quantity": 1
}
```

If the product is already in the cart, the quantity is incremented. Maximum 50 distinct items per cart. Cart expires after 72 hours of inactivity.

### Remove from Cart

```http
DELETE /cart/items/:productId
x-customer-id: cust_abc123
```

### Update Quantity

```http
PATCH /cart/items/:productId
x-customer-id: cust_abc123

{ "quantity": 3 }
```

### Get Cart

```http
GET /cart
x-customer-id: cust_abc123
```

Returns the full cart with computed subtotal.

## Payments

### Initiate Payment

```http
POST /payments

{
  "orderId": "ord_1710000000_abc123",
  "customerId": "cust_abc123",
  "amount": 65.97,
  "currency": "USD",
  "method": "credit_card"
}
```

Generates an idempotency key automatically. See [ADR-005](./adr-005-payment-idempotency.md) for details on duplicate prevention.

### Payment Webhook

```http
POST /payments/webhook
stripe-signature: sha256_whsec_test_...

{ "type": "payment_intent.succeeded", "data": { "id": "pi_..." } }
```

Verifies the Stripe signature before processing. Supported events: `payment_intent.succeeded`, `payment_intent.failed`, `charge.refunded`.

### Payment Status

```http
GET /payments/:id/status
```

## Refunds

### Request Refund

```http
POST /refunds

{
  "paymentId": "pay_abc123",
  "orderId": "ord_abc123",
  "amount": 29.99,
  "reason": "Item arrived damaged"
}
```

Creates a pending refund request. Must be approved before processing.

### Approve Refund

```http
POST /refunds/:id/approve

{ "approvedBy": "admin_jane" }
```

### Refund Status

```http
GET /refunds/:id
```

## Shipping

### Calculate Rates

```http
POST /shipping/rates

{
  "destination": {
    "line1": "456 Oak Ave",
    "city": "Seattle",
    "state": "WA",
    "postalCode": "98101",
    "country": "US"
  },
  "weightLbs": 2.5
}
```

Returns available carriers and methods sorted by cost.

### Track Shipment

```http
GET /shipping/track/1Z999AA10123456784?carrier=ups
```

Returns tracking events and estimated delivery date. See [Shipping Providers](./shipping-providers.md) for carrier-specific details.

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

Validation errors return an array:

```json
{
  "errors": ["Field X is required", "Field Y must be positive"]
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Missing or invalid authentication |
| 404 | Resource not found |
| 422 | Business rule violation |
| 500 | Internal server error |
