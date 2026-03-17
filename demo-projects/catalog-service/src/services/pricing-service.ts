/**
 * Pricing service — price calculation, discounts, bulk pricing, and currency conversion.
 * Supports percentage and fixed-amount discounts, tiered bulk pricing schedules,
 * and multi-currency conversion with configurable exchange rates.
 *
 * @see {@link ../../docs/pricing-rules.md} for discount types and tax integration
 * @see {@link ../models/product.ts} for ProductVariant.price
 */

/** Discount types supported by the pricing engine */
export type DiscountType = 'percentage' | 'fixed' | 'buy_x_get_y';

/** A discount rule applied to a product or category */
export interface DiscountRule {
  id: string;
  name: string;
  type: DiscountType;
  value: number;
  minQuantity?: number;
  maxUsesPerOrder?: number;
  applicableTo: { productIds?: string[]; categoryIds?: string[]; tags?: string[] };
  validFrom: Date;
  validUntil: Date;
}

/** Bulk pricing tier — unit price decreases with quantity */
export interface PricingTier {
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
}

/** Currency conversion rate relative to base currency (USD) */
export interface ExchangeRate {
  currency: string;
  rate: number;
  updatedAt: Date;
}

/** In-memory stores */
const discountRules: Map<string, DiscountRule> = new Map();
const pricingTiers: Map<string, PricingTier[]> = new Map();
const exchangeRates: Map<string, ExchangeRate> = new Map();

/**
 * Calculate the final price for a line item, applying applicable discounts
 * and bulk pricing tiers.
 *
 * @param basePrice - The base unit price from the product variant
 * @param quantity - Number of units
 * @param productId - Used to look up applicable discount rules
 * @returns The total line item price after all adjustments
 */
export function calculatePrice(basePrice: number, quantity: number, productId: string): number {
  let unitPrice = basePrice;

  // Apply bulk pricing tier if available
  const tiers = pricingTiers.get(productId);
  if (tiers) {
    const tier = tiers.find(t => quantity >= t.minQuantity && (t.maxQuantity === null || quantity <= t.maxQuantity));
    if (tier) unitPrice = tier.unitPrice;
  }

  let totalPrice = unitPrice * quantity;

  // Apply discount rules (best discount wins, not stacked)
  const applicableDiscounts = findApplicableDiscounts(productId);
  if (applicableDiscounts.length > 0) {
    const bestDiscount = applicableDiscounts
      .map(d => computeDiscount(d, unitPrice, quantity))
      .sort((a, b) => b - a)[0];
    totalPrice -= bestDiscount;
  }

  return Math.max(roundPrice(totalPrice), 0);
}

/**
 * Compute the discount amount for a single rule.
 */
function computeDiscount(rule: DiscountRule, unitPrice: number, quantity: number): number {
  if (rule.minQuantity && quantity < rule.minQuantity) return 0;

  switch (rule.type) {
    case 'percentage':
      return unitPrice * quantity * (rule.value / 100);
    case 'fixed':
      return rule.value;
    case 'buy_x_get_y':
      // Buy X get 1 free: value = X (e.g., buy 2 get 1 free)
      const freeItems = Math.floor(quantity / (rule.value + 1));
      return freeItems * unitPrice;
    default:
      return 0;
  }
}

/** Find discount rules applicable to a product */
function findApplicableDiscounts(productId: string): DiscountRule[] {
  const now = new Date();
  return Array.from(discountRules.values()).filter(rule => {
    if (now < rule.validFrom || now > rule.validUntil) return false;
    if (rule.applicableTo.productIds?.includes(productId)) return true;
    return false;
  });
}

/**
 * Convert a price from USD to the target currency.
 * @throws Error if the exchange rate is not configured
 */
export function convertCurrency(amountUsd: number, targetCurrency: string): number {
  if (targetCurrency === 'USD') return roundPrice(amountUsd);

  const rate = exchangeRates.get(targetCurrency);
  if (!rate) throw new Error(`Exchange rate not configured for ${targetCurrency}`);

  return roundPrice(amountUsd * rate.rate);
}

/**
 * Update or set an exchange rate for a currency.
 */
export function setExchangeRate(currency: string, rate: number): void {
  exchangeRates.set(currency, { currency, rate, updatedAt: new Date() });
}

/**
 * Register a discount rule. Overwrites any existing rule with the same ID.
 */
export function addDiscountRule(rule: DiscountRule): void {
  discountRules.set(rule.id, rule);
}

/**
 * Set bulk pricing tiers for a product. Tiers must not overlap.
 */
export function setPricingTiers(productId: string, tiers: PricingTier[]): void {
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  pricingTiers.set(productId, sorted);
}

/** Round to 2 decimal places to avoid floating-point artifacts */
function roundPrice(amount: number): number {
  return Math.round(amount * 100) / 100;
}
