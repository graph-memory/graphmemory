/**
 * Currency conversion, formatting, and rounding utilities.
 * Uses a static exchange rate table; in production, rates would be fetched
 * from a live feed (e.g., Open Exchange Rates, ECB).
 */

/** ISO 4217 currency codes supported by the platform */
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

/** Currency metadata for display and rounding */
interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  decimalPlaces: number;
  name: string;
}

/** Currency registry with display metadata */
const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$', decimalPlaces: 2, name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '\u20AC', decimalPlaces: 2, name: 'Euro' },
  GBP: { code: 'GBP', symbol: '\u00A3', decimalPlaces: 2, name: 'British Pound' },
  CAD: { code: 'CAD', symbol: 'C$', decimalPlaces: 2, name: 'Canadian Dollar' },
  AUD: { code: 'AUD', symbol: 'A$', decimalPlaces: 2, name: 'Australian Dollar' },
  JPY: { code: 'JPY', symbol: '\u00A5', decimalPlaces: 0, name: 'Japanese Yen' },
};

/** Exchange rates relative to USD (1 USD = X units of target currency) */
const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
};

/**
 * Convert an amount from one currency to another.
 * @param amount - Source amount
 * @param from - Source currency code
 * @param to - Target currency code
 * @returns Converted amount rounded per target currency rules
 */
export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;

  const inUsd = amount / EXCHANGE_RATES[from];
  const converted = inUsd * EXCHANGE_RATES[to];
  return roundForCurrency(converted, to);
}

/**
 * Format a monetary amount for display with the correct symbol and decimals.
 * @param amount - Monetary amount
 * @param currency - Currency code
 * @returns Formatted string like "$12.99" or "\u00A51,495"
 */
export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const info = CURRENCIES[currency];
  const rounded = roundForCurrency(amount, currency);
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: info.decimalPlaces,
    maximumFractionDigits: info.decimalPlaces,
  });
  return `${info.symbol}${formatted}`;
}

/**
 * Round a monetary value according to the currency's decimal place rules.
 * JPY rounds to whole numbers; most others round to 2 decimal places.
 * @param amount - Raw amount
 * @param currency - Currency code determining rounding rules
 */
export function roundForCurrency(amount: number, currency: CurrencyCode): number {
  const places = CURRENCIES[currency].decimalPlaces;
  const factor = Math.pow(10, places);
  return Math.round(amount * factor) / factor;
}

/**
 * Get display metadata for a currency.
 * @param code - ISO 4217 currency code
 * @returns Currency info or undefined if not supported
 */
export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCIES[code as CurrencyCode];
}
