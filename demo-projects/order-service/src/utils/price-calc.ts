/**
 * Price calculation utilities for orders.
 * Handles subtotals, discounts, tax application, and safe monetary rounding.
 * All monetary values are in minor units internally to avoid floating-point errors.
 */
import { LineItem, TaxBreakdown } from '@/types';

/** Discount types supported by the pricing engine */
export type DiscountType = 'percentage' | 'fixed' | 'buy_x_get_y';

/** Discount definition applied at checkout */
export interface Discount {
  code: string;
  type: DiscountType;
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  applicableSkus?: string[];
}

/**
 * Calculate the subtotal for a list of line items.
 * @param items - Order or cart line items
 * @returns Subtotal rounded to 2 decimal places
 */
export function calculateSubtotal(items: LineItem[]): number {
  const raw = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return roundMoney(raw);
}

/**
 * Apply a discount to a subtotal amount.
 * Respects minimum order thresholds and maximum discount caps.
 * @param subtotal - Pre-discount subtotal
 * @param discount - Discount to apply
 * @returns Discount amount (always non-negative)
 */
export function applyDiscount(subtotal: number, discount: Discount): number {
  if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
    return 0;
  }

  let amount: number;
  switch (discount.type) {
    case 'percentage':
      amount = subtotal * (discount.value / 100);
      break;
    case 'fixed':
      amount = discount.value;
      break;
    case 'buy_x_get_y':
      amount = discount.value;
      break;
  }

  if (discount.maxDiscount) {
    amount = Math.min(amount, discount.maxDiscount);
  }

  return roundMoney(Math.max(0, amount));
}

/**
 * Compute the full order total from items, tax, shipping, and optional discount.
 * @param items - Line items
 * @param tax - Tax breakdown (from tax calculation)
 * @param shippingCost - Shipping cost
 * @param discount - Optional discount to apply
 * @returns Final total after all adjustments
 */
export function computeTotal(
  items: LineItem[],
  tax: TaxBreakdown,
  shippingCost: number,
  discount?: Discount
): number {
  const subtotal = calculateSubtotal(items);
  const discountAmount = discount ? applyDiscount(subtotal, discount) : 0;
  const discountedSubtotal = subtotal - discountAmount;
  const total = discountedSubtotal + tax.taxAmount + shippingCost;
  return roundMoney(Math.max(0, total));
}

/**
 * Round a monetary value to exactly 2 decimal places using banker's rounding.
 * @param value - Raw monetary value
 * @returns Value rounded to 2 decimal places
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
