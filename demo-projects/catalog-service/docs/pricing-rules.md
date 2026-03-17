# Pricing Rules

Configuration and behavior of the ShopFlow pricing engine. The pricing service supports three discount types, bulk pricing tiers, and multi-currency conversion.

## Price Calculation Flow

```
Base Variant Price
       │
       ▼
  Apply Bulk Tier (if configured)
       │
       ▼
  Find Applicable Discounts
       │
       ▼
  Apply Best Discount (single, not stacked)
       │
       ▼
  Round to 2 Decimal Places
       │
       ▼
  Final Price (minimum $0.00)
```

The pricing logic is implemented in the [pricing service](../src/services/pricing-service.ts). Discounts are **not stacked** — only the most favorable discount applies per line item.

## Discount Types

### Percentage Discount

Reduces the total line item price by a percentage:

```typescript
const rule: DiscountRule = {
  id: "summer-sale",
  name: "Summer Sale 20% Off",
  type: "percentage",
  value: 20,  // 20% off
  applicableTo: { tags: ["summer"] },
  validFrom: new Date("2026-06-01"),
  validUntil: new Date("2026-08-31"),
};
```

**Calculation:** `discount = unitPrice × quantity × (value / 100)`

### Fixed Amount Discount

Subtracts a fixed amount from the total line item price:

```typescript
const rule: DiscountRule = {
  id: "flat-10",
  name: "$10 Off Electronics",
  type: "fixed",
  value: 10,  // $10 off the total
  minQuantity: 2,
  applicableTo: { categoryIds: ["cat_electronics"] },
  validFrom: new Date("2026-01-01"),
  validUntil: new Date("2026-12-31"),
};
```

**Calculation:** `discount = value` (applied once per line item, not per unit)

### Buy X Get Y Free

A promotional rule where purchasing X items grants Y free items:

```typescript
const rule: DiscountRule = {
  id: "buy2get1",
  name: "Buy 2 Get 1 Free",
  type: "buy_x_get_y",
  value: 2,  // Buy 2, get 1 free (value = X)
  applicableTo: { productIds: ["prod_tshirt"] },
  validFrom: new Date("2026-03-01"),
  validUntil: new Date("2026-03-31"),
};
```

**Calculation:** `freeItems = floor(quantity / (X + 1))`, `discount = freeItems × unitPrice`

For a quantity of 6 with "buy 2 get 1 free": `floor(6 / 3) = 2` free items.

## Bulk Pricing Tiers

Tiered pricing reduces the per-unit cost based on order quantity. Tiers must not overlap.

```typescript
const tiers: PricingTier[] = [
  { minQuantity: 1,   maxQuantity: 9,    unitPrice: 29.99 },
  { minQuantity: 10,  maxQuantity: 49,   unitPrice: 24.99 },
  { minQuantity: 50,  maxQuantity: 99,   unitPrice: 19.99 },
  { minQuantity: 100, maxQuantity: null,  unitPrice: 14.99 },  // null = unlimited
];
```

Tiers are matched by finding the first tier where `minQuantity <= quantity <= maxQuantity`. The `null` max represents unlimited quantity (catch-all for large orders).

### Tier + Discount Interaction

Bulk tiers are applied **before** discount rules. The discount is calculated on the tier-adjusted unit price:

```
Base price: $29.99
Quantity: 50 → Tier price: $19.99/unit
20% discount → $19.99 × 50 × 0.80 = $799.60
```

## Currency Conversion

The pricing service supports multi-currency display using configurable exchange rates.

### Setting Exchange Rates

```typescript
setExchangeRate('EUR', 0.92);
setExchangeRate('GBP', 0.79);
setExchangeRate('JPY', 149.50);
```

Exchange rates are stored relative to USD (base currency). All internal prices are in USD; conversion happens at the presentation layer.

### Converting Prices

```typescript
convertCurrency(29.99, 'EUR');  // => 27.59
convertCurrency(29.99, 'GBP');  // => 23.69
convertCurrency(29.99, 'JPY');  // => 4483.51
```

Results are rounded to 2 decimal places regardless of currency conventions.

### Rate Updates

In production, exchange rates should be updated daily from a reliable API (e.g., ECB, Open Exchange Rates). The `updatedAt` timestamp on each rate enables staleness detection.

## Tax Integration

Tax calculation is **not** handled by the pricing service. The pricing service outputs pre-tax prices; tax is applied by the checkout service based on:

- Customer shipping address (jurisdiction)
- Product category (tax classification)
- Applicable tax exemptions

The recommended integration point is after `calculatePrice()` returns:

```typescript
const preTaxTotal = calculatePrice(basePrice, quantity, productId);
const taxRate = taxService.getRate(shippingAddress, productCategory);
const taxAmount = preTaxTotal * taxRate;
const grandTotal = preTaxTotal + taxAmount;
```

## Configuration Best Practices

1. **Avoid overlapping discount rules** — when multiple rules match, the best (largest) discount wins, which can be confusing for customers
2. **Set reasonable `validUntil` dates** — expired rules are still evaluated (filtered by date), so clean up old rules to maintain performance
3. **Test tier boundaries** — ensure quantities at tier boundaries produce expected prices
4. **Use `minQuantity` on fixed discounts** — prevents $10 off a single $5 item from resulting in a negative price (the service clamps to $0)
5. **Update exchange rates daily** — stale rates lead to pricing inconsistencies across currencies

## Related

- [API Reference](api-reference.md) — Product endpoints with pricing in responses
- [Data Model](data-model.md) — ProductVariant.price and compareAtPrice fields
- [Import Guide](import-guide.md) — Price validation during bulk import
