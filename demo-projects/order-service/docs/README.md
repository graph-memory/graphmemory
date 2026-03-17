# Order Service

The Order Service is the central microservice in the ShopFlow e-commerce platform responsible for managing the complete order lifecycle — from shopping cart through payment, fulfillment, and delivery.

## Domain Overview

This service owns the following bounded contexts:

- **Orders** — Creation, state management, and lifecycle tracking
- **Shopping Cart** — Session-based cart with guest-to-customer merge
- **Payments** — Gateway integration (Stripe), idempotency, webhooks
- **Refunds** — Request, approval workflow, partial/full refund processing
- **Shipping** — Rate calculation, carrier integration, package tracking

## Integration Points

The Order Service integrates with several other ShopFlow services:

### Catalog Service
- Product lookup for cart item validation
- Price verification at checkout time
- Stock reservation via the inventory API

### Payment Gateway (Stripe)
- Payment intent creation and capture
- Webhook event processing
- Refund submission and tracking
- See [Payment Integration Guide](./payment-integration.md)

### Notification Service
- Order confirmation emails
- Shipping update notifications
- Refund completion alerts

### Shipping Carriers
- USPS, FedEx, UPS, DHL rate APIs
- Tracking number registration
- Delivery confirmation webhooks
- See [Shipping Providers](./shipping-providers.md)

## Quick Start

```bash
# Install dependencies
npm install

# Build the service
npm run build

# Start in development mode
npm run dev

# Run tests
npm test
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/orders` | Create a new order |
| `GET` | `/orders/:id` | Get order details |
| `GET` | `/orders` | List orders (filterable) |
| `POST` | `/orders/:id/cancel` | Cancel an order |
| `POST` | `/cart/items` | Add item to cart |
| `DELETE` | `/cart/items/:productId` | Remove item from cart |
| `PATCH` | `/cart/items/:productId` | Update item quantity |
| `GET` | `/cart` | Get current cart |
| `POST` | `/payments` | Initiate payment |
| `POST` | `/payments/webhook` | Payment gateway webhook |
| `GET` | `/payments/:id/status` | Check payment status |
| `POST` | `/refunds` | Request a refund |
| `POST` | `/refunds/:id/approve` | Approve a refund |
| `GET` | `/refunds/:id` | Get refund status |
| `POST` | `/shipping/rates` | Calculate shipping rates |
| `GET` | `/shipping/track/:num` | Track a shipment |

See [API Reference](./api-reference.md) for full request/response documentation.

## Architecture

```
src/
  controllers/     # HTTP request handlers
  services/        # Business logic layer
  models/          # Domain entities and validation
  utils/           # Pricing, tax, currency utilities
  types/           # Shared TypeScript types
docs/              # Documentation
```

## Key Design Decisions

- [ADR-005: Payment Idempotency](./adr-005-payment-idempotency.md)
- [ADR-006: Order Saga Pattern](./adr-006-order-saga.md)

## Related Documentation

- [Order State Machine](./order-state-machine.md)
- [Tax Calculation Rules](./tax-rules.md)
- [Shipping Provider Integration](./shipping-providers.md)
