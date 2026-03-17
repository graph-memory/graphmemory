/**
 * Cart controller: HTTP request handlers for shopping cart operations.
 * Routes: POST /cart/items, DELETE /cart/items/:productId,
 *         PATCH /cart/items/:productId, GET /cart
 */
import { Request, Response } from 'express';
import { Cart } from '@/models/cart-item';
import { createCart, addToCart, removeFromCart, isCartExpired, cartSubtotal } from '@/services/cart-service';

/** In-memory cart store keyed by customer/session ID */
const carts = new Map<string, Cart>();

/**
 * Get or create a cart for the current session.
 * Uses the x-customer-id header to identify the customer.
 */
function getOrCreateCart(customerId: string): Cart {
  let cart = carts.get(customerId);
  if (!cart || isCartExpired(cart)) {
    cart = createCart(customerId);
    carts.set(customerId, cart);
  }
  return cart;
}

/**
 * POST /cart/items — Add a product to the shopping cart.
 * Body: { productId, sku, name, unitPrice, currency, quantity }
 */
export function handleAddToCart(req: Request, res: Response): void {
  const customerId = req.headers['x-customer-id'] as string;
  if (!customerId) {
    res.status(401).json({ error: 'Missing x-customer-id header' });
    return;
  }

  const { productId, sku, name, unitPrice, currency, quantity } = req.body;
  const cart = getOrCreateCart(customerId);

  try {
    const updated = addToCart(cart, productId, sku, name, unitPrice, currency, quantity ?? 1);
    carts.set(customerId, updated);
    res.status(200).json({ cart: updated, subtotal: cartSubtotal(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
}

/**
 * DELETE /cart/items/:productId — Remove a product from the cart entirely.
 */
export function handleRemoveFromCart(req: Request, res: Response): void {
  const customerId = req.headers['x-customer-id'] as string;
  if (!customerId) {
    res.status(401).json({ error: 'Missing x-customer-id header' });
    return;
  }

  const cart = carts.get(customerId);
  if (!cart) {
    res.status(404).json({ error: 'Cart not found' });
    return;
  }

  const updated = removeFromCart(cart, req.params.productId);
  carts.set(customerId, updated);
  res.json({ cart: updated, subtotal: cartSubtotal(updated) });
}

/**
 * PATCH /cart/items/:productId — Update quantity for a cart item.
 * Body: { quantity: number }
 */
export function handleUpdateQuantity(req: Request, res: Response): void {
  const customerId = req.headers['x-customer-id'] as string;
  const cart = carts.get(customerId);
  if (!cart) {
    res.status(404).json({ error: 'Cart not found' });
    return;
  }

  const item = cart.items.find((i) => i.productId === req.params.productId);
  if (!item) {
    res.status(404).json({ error: 'Item not found in cart' });
    return;
  }

  item.quantity = req.body.quantity;
  cart.updatedAt = new Date();
  res.json({ cart, subtotal: cartSubtotal(cart) });
}

/**
 * GET /cart — Retrieve the current customer's cart with subtotal.
 */
export function handleGetCart(req: Request, res: Response): void {
  const customerId = req.headers['x-customer-id'] as string;
  const cart = carts.get(customerId);
  if (!cart) {
    res.json({ cart: null, subtotal: 0 });
    return;
  }
  res.json({ cart, subtotal: cartSubtotal(cart) });
}
