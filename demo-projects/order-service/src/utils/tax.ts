/**
 * Tax calculation engine for the order service.
 * Looks up regional tax rates, handles exemptions, and computes tax breakdowns.
 * See docs/tax-rules.md for the full rule set.
 */
import { TaxBreakdown } from '@/types';

/** Tax category for product classification */
export type TaxCategory = 'standard' | 'food' | 'clothing' | 'digital' | 'medical';

/** Regional tax rate entry */
interface TaxRateEntry {
  state: string;
  baseRate: number;
  reducedCategories: Partial<Record<TaxCategory, number>>;
  exemptCategories: TaxCategory[];
}

/** US state tax rates (simplified) */
const STATE_TAX_RATES: TaxRateEntry[] = [
  { state: 'CA', baseRate: 0.0725, reducedCategories: { food: 0 }, exemptCategories: ['medical'] },
  { state: 'NY', baseRate: 0.08, reducedCategories: { clothing: 0 }, exemptCategories: ['medical', 'food'] },
  { state: 'TX', baseRate: 0.0625, reducedCategories: {}, exemptCategories: ['food', 'medical'] },
  { state: 'WA', baseRate: 0.065, reducedCategories: {}, exemptCategories: ['food'] },
  { state: 'FL', baseRate: 0.06, reducedCategories: {}, exemptCategories: ['food', 'medical'] },
  { state: 'OR', baseRate: 0, reducedCategories: {}, exemptCategories: [] },
  { state: 'NH', baseRate: 0, reducedCategories: {}, exemptCategories: [] },
];

/**
 * Look up the effective tax rate for a given state and product category.
 * @param state - US state abbreviation
 * @param category - Product tax category
 * @returns Effective tax rate as a decimal (e.g. 0.0725)
 */
export function getTaxRate(state: string, category: TaxCategory = 'standard'): number {
  const entry = STATE_TAX_RATES.find((r) => r.state === state);
  if (!entry) return 0;

  if (entry.exemptCategories.includes(category)) return 0;

  const reduced = entry.reducedCategories[category];
  if (reduced !== undefined) return reduced;

  return entry.baseRate;
}

/**
 * Compute the full tax breakdown for an order.
 * @param subtotal - Pre-tax subtotal
 * @param state - Shipping destination state
 * @param category - Primary product tax category
 * @returns Tax breakdown with rate, amount, and applied exemptions
 */
export function computeTax(
  subtotal: number,
  state: string,
  category: TaxCategory = 'standard'
): TaxBreakdown {
  const entry = STATE_TAX_RATES.find((r) => r.state === state);
  const taxRate = getTaxRate(state, category);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const exemptions: string[] = [];

  if (entry?.exemptCategories.includes(category)) {
    exemptions.push(`${category} exempt in ${state}`);
  }
  if (taxRate === 0 && entry?.baseRate === 0) {
    exemptions.push(`${state} has no sales tax`);
  }

  return { subtotal, taxRate, taxAmount, exemptions };
}

/**
 * Check if a state is tax-free (no sales tax at all).
 * @param state - US state abbreviation
 */
export function isTaxFreeState(state: string): boolean {
  const entry = STATE_TAX_RATES.find((r) => r.state === state);
  return entry?.baseRate === 0;
}
