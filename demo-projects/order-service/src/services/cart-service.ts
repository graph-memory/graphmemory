/**
 * Cart management service: add/remove items, merge guest carts,
 * handle cart expiration, and validate stock availability.
 */
import { Cart, CartEntry, createCartEntry, validateQuantity } from '@/models/cart-item';

/** Default cart expiration time: 72 hours */
const CART_TTL_MS = 72 * 60 * 60 * 1000;

/** Maximum number of distinct items allowed in a single cart */
const MAX_CART_ITEMS = 50;

/**
 * Create a new empty cart for a customer session.
 * @param customerId - Customer or session identifier
 * @returns Fresh cart with expiration set
 */
export function createCart(customerId: string): Cart {
  const now = new Date();
  return {
    id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customerId,
    items: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + CART_TTL_MS),
  };
}

/**
 * Add a product to the cart or increment its quantity if already present.
 * @param cart - Current cart
 * @param productId - Catalog product ID
 * @param sku - Stock keeping unit
 * @param name - Product name
 * @param unitPrice - Current price
 * @param currency - Currency code
 * @param quantity - Quantity to add
 * @returns Updated cart
 */
export function addToCart(
  cart: Cart,
  productId: string,
  sku: string,
  name: string,
  unitPrice: number,
  currency: string,
  quantity: number = 1
): Cart {
  const existing = cart.items.find((item) => item.productId === productId);

  if (existing) {
    const newQty = existing.quantity + quantity;
    validateQuantity(newQty);
    existing.quantity = newQty;
    existing.priceSnapshotAt = new Date();
  } else {
    if (cart.items.length >= MAX_CART_ITEMS) {
      throw new Error(`Cart cannot contain more than ${MAX_CART_ITEMS} distinct items`);
    }
    const entry = createCartEntry(productId, sku, name, unitPrice, currency, quantity);
    cart.items.push(entry);
  }

  cart.updatedAt = new Date();
  return cart;
}

/**
 * Remove a product entirely from the cart.
 * @param cart - Current cart
 * @param productId - Product to remove
 * @returns Updated cart with item removed
 */
export function removeFromCart(cart: Cart, productId: string): Cart {
  cart.items = cart.items.filter((item) => item.productId !== productId);
  cart.updatedAt = new Date();
  return cart;
}

/**
 * Merge a guest (anonymous) cart into an authenticated customer's cart.
 * Items from the guest cart are added; if the same product exists in both,
 * the quantity is summed. Guest cart is emptied after merge.
 * @param customerCart - Authenticated customer's cart
 * @param guestCart - Anonymous session cart
 * @returns Merged customer cart
 */
export function mergeCarts(customerCart: Cart, guestCart: Cart): Cart {
  for (const guestItem of guestCart.items) {
    customerCart = addToCart(
      customerCart,
      guestItem.productId,
      guestItem.sku,
      guestItem.name,
      guestItem.unitPrice,
      guestItem.currency,
      guestItem.quantity
    );
  }
  guestCart.items = [];
  return customerCart;
}

/**
 * Check whether a cart has expired based on its TTL.
 * Expired carts should be cleaned up by a background job.
 * @param cart - Cart to check
 */
export function isCartExpired(cart: Cart): boolean {
  return new Date() > cart.expiresAt;
}

/**
 * Compute the cart subtotal across all items.
 * @param cart - Cart to total
 * @returns Sum of all line item totals
 */
export function cartSubtotal(cart: Cart): number {
  const raw = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return Math.round(raw * 100) / 100;
}
