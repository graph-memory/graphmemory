/**
 * Shopping cart hook for the ShopFlow Web Store.
 *
 * Manages cart state with optimistic updates, automatic localStorage
 * persistence, and quantity validation against available stock.
 * Provides computed totals and item count for header badge display.
 * @module hooks/useCart
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CartItem, Product } from '@/types';
import { saveCart, loadCart, clearCart as clearStoredCart } from '@/services/storage';

/** Return type for the useCart hook */
export interface UseCartReturn {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (product: Product, quantity?: number, variantId?: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  isInCart: (productId: string, variantId?: string) => boolean;
}

/**
 * Find the index of a cart item by product ID and optional variant ID.
 * Returns -1 if the item is not in the cart.
 */
function findItemIndex(items: CartItem[], productId: string, variantId?: string): number {
  return items.findIndex(
    (item) => item.productId === productId && item.variantId === variantId
  );
}

/**
 * Hook providing full cart management with localStorage persistence.
 * State is loaded from storage on mount and saved on every change.
 */
export function useCart(): UseCartReturn {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addItem = useCallback(
    (product: Product, quantity = 1, variantId?: string) => {
      setItems((prev) => {
        const idx = findItemIndex(prev, product.id, variantId);
        if (idx >= 0) {
          const updated = [...prev];
          const existing = updated[idx];
          updated[idx] = {
            ...existing,
            quantity: Math.min(existing.quantity + quantity, existing.maxQuantity),
          };
          return updated;
        }
        const variant = variantId
          ? product.variants.find((v) => v.id === variantId)
          : undefined;
        const newItem: CartItem = {
          productId: product.id,
          variantId,
          title: variant ? `${product.title} - ${variant.name}` : product.title,
          price: variant?.price ?? product.price,
          quantity,
          image: product.images[0]?.url ?? '',
          maxQuantity: 99,
        };
        return [...prev, newItem];
      });
    },
    []
  );

  const removeItem = useCallback((productId: string, variantId?: string) => {
    setItems((prev) => prev.filter(
      (item) => !(item.productId === productId && item.variantId === variantId)
    ));
  }, []);

  const updateQuantity = useCallback(
    (productId: string, quantity: number, variantId?: string) => {
      if (quantity <= 0) {
        removeItem(productId, variantId);
        return;
      }
      setItems((prev) => {
        const idx = findItemIndex(prev, productId, variantId);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: Math.min(quantity, updated[idx].maxQuantity),
        };
        return updated;
      });
    },
    [removeItem]
  );

  const clearCart = useCallback(() => {
    setItems([]);
    clearStoredCart();
  }, []);

  const isInCart = useCallback(
    (productId: string, variantId?: string) => findItemIndex(items, productId, variantId) >= 0,
    [items]
  );

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);

  return { items, itemCount, subtotal, addItem, removeItem, updateQuantity, clearCart, isInCart };
}
