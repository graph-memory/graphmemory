# Shipping Provider Integration

The Order Service integrates with multiple shipping carriers to provide rate calculation, label generation, and package tracking. The shipping logic lives in `src/services/shipping-service.ts`.

## Supported Carriers

| Carrier | Domestic | International | Tracking API | Rate API |
|---------|----------|---------------|-------------|----------|
| USPS | Yes | Limited | Yes | Yes |
| FedEx | Yes | Yes | Yes | Yes |
| UPS | Yes | Yes | Yes | Yes |
| DHL | No | Yes | Yes | Yes |

DHL is only used for international shipments. Domestic orders default to USPS, FedEx, or UPS based on cost and delivery speed.

## Rate Calculation

### How It Works

The `calculateShippingRates()` function computes available options based on:

1. **Destination address** — Domestic vs. international, zone-based pricing
2. **Package weight** — Per-pound rate with a base fee
3. **Speed tier** — Ground, express, overnight (carrier-dependent)

```typescript
import { calculateShippingRates } from '@/services/shipping-service';

const options = calculateShippingRates(
  { line1: '456 Oak Ave', city: 'Seattle', state: 'WA', postalCode: '98101', country: 'US' },
  2.5  // weight in pounds
);

// Returns sorted by cost:
// [
//   { carrier: 'usps', method: 'ground', estimatedDays: 7, cost: 5.37 },
//   { carrier: 'ups', method: 'ground', estimatedDays: 5, cost: 9.92 },
//   ...
// ]
```

### Speed Multipliers

Faster shipping tiers apply a cost multiplier:

| Tier | Days | Multiplier |
|------|------|-----------|
| Ground / Standard | 5-10 | 1.0x |
| Express / Priority | 2-5 | 1.5x |
| Overnight / Next Day | 1-2 | 2.5x |

### Base Rates

| Carrier | Base Fee | Per Pound |
|---------|----------|-----------|
| USPS | $3.99 | $0.55 |
| FedEx | $7.99 | $0.85 |
| UPS | $6.99 | $0.78 |
| DHL | $12.99 | $1.20 |

## Tracking Integration

### Fetching Tracking Data

```typescript
import { getTracking } from '@/services/shipping-service';

const tracking = await getTracking('1Z999AA10123456784', 'ups');
// Returns:
// {
//   trackingNumber: '1Z999AA10123456784',
//   carrier: 'ups',
//   status: 'in_transit',
//   estimatedDelivery: '2026-03-20T00:00:00Z',
//   events: [
//     { timestamp: '...', location: 'Distribution Center, Memphis TN', ... },
//     { timestamp: '...', location: 'Origin Facility, Los Angeles CA', ... }
//   ]
// }
```

### Tracking Statuses

| Status | Description |
|--------|-------------|
| `pre_transit` | Label created, not yet picked up |
| `in_transit` | Package moving through carrier network |
| `out_for_delivery` | On the delivery vehicle |
| `delivered` | Confirmed delivery |
| `exception` | Delivery issue (weather, address, etc.) |

### Webhook Events

Carriers push status updates via webhooks. The order service processes these to:

1. Update the order's tracking status
2. Send notification emails via the [Notification Service](../src/services/notification-service.ts)
3. Trigger the `shipped` → `delivered` order state transition

## Fallback Strategy

If a carrier's API is unavailable, the service uses a tiered fallback:

1. **Primary** — Call the carrier's live rate/tracking API
2. **Cache** — Use cached rates (valid for 1 hour) for rate calculation
3. **Static** — Fall back to the static rate table in `shipping-service.ts`
4. **Default** — Offer only USPS ground as a guaranteed option

For tracking, if the primary API fails, the service returns the last known tracking data with a `stale: true` flag.

## Cheapest Option Helper

The `cheapestOption()` function returns the lowest-cost shipping option:

```typescript
import { cheapestOption } from '@/services/shipping-service';

const option = cheapestOption(address, 1.5);
// { carrier: 'usps', method: 'ground', estimatedDays: 7, cost: 4.82 }
```

This is used during checkout to pre-select the default shipping method.

## Address Validation

Before calculating rates, addresses are validated using `validateAddress()` from `src/models/address.ts`. Supported countries: US, CA, GB, DE, FR, AU, JP.

Invalid addresses receive a 400 response with specific error messages:

```json
{
  "errors": [
    "Invalid US postal code format",
    "Address line 1 is required"
  ]
}
```

## Future Improvements

- Real-time carrier API integration (replacing static rate table)
- Dimensional weight pricing (length x width x height)
- Multi-package shipment support
- Return label generation
- Insurance and signature confirmation options
- Delivery date guarantees with money-back promise

## Related

- [API Reference — Shipping](./api-reference.md#shipping)
- [Address Model](../src/models/address.ts)
- [Notification Service](../src/services/notification-service.ts)
