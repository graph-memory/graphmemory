/**
 * Typed localStorage wrapper for the ShopFlow Web Store.
 *
 * Provides type-safe get/set operations with JSON serialization,
 * TTL-based expiration, and domain-specific helpers for cart,
 * search history, and user preference persistence.
 * @module services/storage
 */

import type { CartItem, UserPreferences } from '@/types';

const CART_KEY = 'shopflow_cart';
const SEARCH_HISTORY_KEY = 'shopflow_search_history';
const PREFERENCES_KEY = 'shopflow_preferences';
const MAX_SEARCH_HISTORY = 20;

/** Wrapper that stores a value alongside an optional expiration timestamp */
interface StorageEntry<T> {
  value: T;
  expiresAt: number | null;
}

/**
 * Read a typed value from localStorage.
 * Returns the fallback if the key is missing, unparseable, or expired.
 */
export function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const entry: StorageEntry<T> = JSON.parse(raw);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return fallback;
    }
    return entry.value;
  } catch {
    return fallback;
  }
}

/**
 * Write a typed value to localStorage with optional TTL in seconds.
 * Values are JSON-serialized with an expiration wrapper.
 */
export function setItem<T>(key: string, value: T, ttlSeconds?: number): void {
  const entry: StorageEntry<T> = {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  };
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn(`Failed to write to localStorage key "${key}":`, error);
  }
}

/** Remove a key from localStorage */
export function removeItem(key: string): void {
  localStorage.removeItem(key);
}

/** Persist the current cart items for recovery across sessions */
export function saveCart(items: CartItem[]): void {
  setItem(CART_KEY, items);
}

/** Load previously saved cart items, returning an empty array if none exist */
export function loadCart(): CartItem[] {
  return getItem<CartItem[]>(CART_KEY, []);
}

/** Clear the persisted cart (e.g. after successful checkout) */
export function clearCart(): void {
  removeItem(CART_KEY);
}

/**
 * Add a search query to the recent search history.
 * Deduplicates entries and enforces a maximum history size.
 */
export function addSearchQuery(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const history = getSearchHistory();
  const filtered = history.filter((q) => q !== trimmed);
  filtered.unshift(trimmed);
  setItem(SEARCH_HISTORY_KEY, filtered.slice(0, MAX_SEARCH_HISTORY));
}

/** Retrieve the list of recent search queries, newest first */
export function getSearchHistory(): string[] {
  return getItem<string[]>(SEARCH_HISTORY_KEY, []);
}

/** Clear all stored search history */
export function clearSearchHistory(): void {
  removeItem(SEARCH_HISTORY_KEY);
}

/** Save user preferences (locale, currency, theme, notifications) */
export function savePreferences(prefs: UserPreferences): void {
  setItem(PREFERENCES_KEY, prefs);
}

/** Load user preferences with sensible defaults for new visitors */
export function loadPreferences(): UserPreferences {
  return getItem<UserPreferences>(PREFERENCES_KEY, {
    locale: 'en-US',
    currency: 'USD',
    theme: 'system',
    emailNotifications: true,
  });
}
