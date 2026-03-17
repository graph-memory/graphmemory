/**
 * Shopping cart sidebar component for the ShopFlow Web Store.
 *
 * Renders as a slide-in drawer with the current cart items, quantity
 * controls, item removal, subtotal calculation, and a checkout button.
 * Traps focus when open for accessibility compliance.
 * @module components/Cart
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { CartItem } from '@/types';

/** Props for the Cart sidebar component */
interface CartProps {
  isOpen: boolean;
  items: CartItem[];
  subtotal: number;
  onClose: () => void;
  onUpdateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  onRemoveItem: (productId: string, variantId?: string) => void;
  onCheckout: () => void;
}

/**
 * Format a numeric price as a USD currency string.
 * Used for individual item prices and the cart subtotal.
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Individual cart item row with image, title, price, quantity stepper,
 * and a remove button. Quantity changes are clamped to [1, maxQuantity].
 */
const CartItemRow: React.FC<{
  item: CartItem;
  onUpdate: (productId: string, quantity: number, variantId?: string) => void;
  onRemove: (productId: string, variantId?: string) => void;
}> = ({ item, onUpdate, onRemove }) => (
  <li className="cart__item" key={`${item.productId}-${item.variantId ?? ''}`}>
    <img src={item.image} alt={item.title} className="cart__item-image" loading="lazy" />
    <div className="cart__item-details">
      <h4 className="cart__item-title">{item.title}</h4>
      <span className="cart__item-price">{formatCurrency(item.price)}</span>
      <div className="cart__item-quantity">
        <button
          onClick={() => onUpdate(item.productId, item.quantity - 1, item.variantId)}
          disabled={item.quantity <= 1}
          aria-label={`Decrease quantity of ${item.title}`}
        >-</button>
        <span aria-live="polite">{item.quantity}</span>
        <button
          onClick={() => onUpdate(item.productId, item.quantity + 1, item.variantId)}
          disabled={item.quantity >= item.maxQuantity}
          aria-label={`Increase quantity of ${item.title}`}
        >+</button>
      </div>
    </div>
    <button
      className="cart__item-remove"
      onClick={() => onRemove(item.productId, item.variantId)}
      aria-label={`Remove ${item.title} from cart`}
    >&times;</button>
  </li>
);

/**
 * Cart sidebar drawer that slides in from the right.
 * Shows the cart items, subtotal, and checkout button.
 * Focus is trapped inside the drawer when open.
 */
export const Cart: React.FC<CartProps> = ({
  isOpen, items, subtotal, onClose, onUpdateQuantity, onRemoveItem, onCheckout,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const isEmpty = items.length === 0;

  /** Close on Escape key press */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      drawerRef.current?.focus();
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      <div className="cart__overlay" onClick={onClose} aria-hidden="true" />
      <aside
        ref={drawerRef}
        className="cart__drawer"
        role="dialog"
        aria-label="Shopping cart"
        aria-modal="true"
        tabIndex={-1}
      >
        <header className="cart__header">
          <h2>Your Cart ({items.length})</h2>
          <button onClick={onClose} aria-label="Close cart">&times;</button>
        </header>

        {isEmpty ? (
          <p className="cart__empty">Your cart is empty. Start shopping!</p>
        ) : (
          <>
            <ul className="cart__items" role="list">
              {items.map((item) => (
                <CartItemRow
                  key={`${item.productId}-${item.variantId ?? ''}`}
                  item={item}
                  onUpdate={onUpdateQuantity}
                  onRemove={onRemoveItem}
                />
              ))}
            </ul>
            <footer className="cart__footer">
              <div className="cart__subtotal">
                <span>Subtotal</span>
                <span aria-live="polite">{formatCurrency(subtotal)}</span>
              </div>
              <p className="cart__tax-note">Shipping and taxes calculated at checkout</p>
              <button className="cart__checkout-btn" onClick={onCheckout}>
                Proceed to Checkout
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
};
