# Tax Calculation Rules

The Order Service calculates sales tax at checkout based on the shipping destination. Tax logic lives in `src/utils/tax.ts` and is called by the order service during order creation and recalculation.

## Overview

Tax calculation follows a destination-based model: tax is charged based on where the order is shipped, not where the seller is located. This is consistent with most US state nexus rules.

## Tax Rates by State

The service maintains a simplified tax rate table for supported US states:

| State | Base Rate | Food | Clothing | Medical | Digital |
|-------|-----------|------|----------|---------|---------|
| CA | 7.25% | Exempt | Standard | Exempt | Standard |
| NY | 8.00% | Exempt | Exempt | Exempt | Standard |
| TX | 6.25% | Exempt | Standard | Exempt | Standard |
| WA | 6.50% | Exempt | Standard | Standard | Standard |
| FL | 6.00% | Exempt | Standard | Exempt | Standard |
| OR | 0.00% | — | — | — | — |
| NH | 0.00% | — | — | — | — |

Oregon and New Hampshire have no sales tax. All rates shown are state-level; local surcharges are not yet implemented.

## Tax Categories

Products are classified into tax categories that determine the applicable rate:

```typescript
type TaxCategory = 'standard' | 'food' | 'clothing' | 'digital' | 'medical';
```

### Category Rules

- **Standard** — Default category for most physical goods. Taxed at the full base rate.
- **Food** — Grocery items (unprepared food). Exempt in most states; prepared food is taxed as standard.
- **Clothing** — Apparel and footwear. Exempt in NY (below $110 threshold, simplified here as full exemption).
- **Digital** — Software, digital downloads, streaming subscriptions. Taxability varies by state.
- **Medical** — Prescription drugs, medical devices. Exempt in most states.

## Calculation Flow

The `computeTax()` function implements the following logic:

```typescript
import { computeTax } from '@/utils/tax';

const tax = computeTax(subtotal, 'CA', 'standard');
// Returns:
// {
//   subtotal: 59.98,
//   taxRate: 0.0725,
//   taxAmount: 4.35,
//   exemptions: []
// }
```

### Steps

1. Look up the state in the tax rate table
2. Check if the product category is exempt in that state
3. Check for reduced rates (e.g., food at 0% in CA)
4. Apply the effective rate to the subtotal
5. Round to 2 decimal places (half-up rounding)

## Exemptions

The `TaxBreakdown` includes an `exemptions` array documenting why certain items were not taxed:

```typescript
const tax = computeTax(29.99, 'OR', 'standard');
// tax.exemptions: ["OR has no sales tax"]

const tax2 = computeTax(49.99, 'NY', 'clothing');
// tax2.exemptions: ["clothing exempt in NY"]
```

## Tax-Free States

The `isTaxFreeState()` helper checks for states with 0% sales tax:

```typescript
import { isTaxFreeState } from '@/utils/tax';

isTaxFreeState('OR'); // true
isTaxFreeState('CA'); // false
```

Currently recognized tax-free states: Oregon (OR), New Hampshire (NH), Montana (MT), Delaware (DE), Alaska (AK — no state tax, local taxes may apply).

## Integration with Pricing

Tax is calculated after subtotal and discounts but before shipping:

```
Subtotal (items)
- Discount
= Discounted Subtotal
+ Tax (on discounted subtotal)
+ Shipping
= Order Total
```

See `computeTotal()` in `src/utils/price-calc.ts` for the full calculation pipeline.

## Limitations

- Local/county tax surcharges are not yet implemented
- Tax-inclusive pricing (common in EU) is not supported
- VAT/GST for international orders requires the Tax Service integration
- Tax on shipping charges varies by state and is not yet handled

## Future Improvements

1. Integration with a tax calculation service (Avalara, TaxJar) for real-time rates
2. Support for local tax surcharges and special taxing districts
3. Tax-inclusive pricing for EU/UK orders
4. Digital goods nexus tracking (for multi-state sellers)
5. Tax exemption certificate management for B2B customers

## Related

- [Price Calculation](../src/utils/price-calc.ts) — Subtotal, discount, and total computation
- [Currency Utilities](../src/utils/currency.ts) — Currency conversion and formatting
- [API Reference](./api-reference.md) — Tax included in order creation response
