/**
 * Inventory service — stock tracking, reservations, and low-stock alerts.
 * Manages real-time stock quantities per SKU with support for temporary
 * reservations (cart holds) that expire after a configurable TTL.
 *
 * @see {@link ../models/product.ts} for ProductVariant.stockQuantity
 * @see {@link ../services/product-service.ts} for product management
 */

/** Stock reservation for a cart/checkout session */
export interface StockReservation {
  id: string;
  sku: string;
  quantity: number;
  expiresAt: Date;
  sessionId: string;
}

/** Low-stock alert configuration per SKU */
export interface LowStockThreshold {
  sku: string;
  threshold: number;
  notifyEmail: string;
}

/** Stock level summary for a single SKU */
export interface StockLevel {
  sku: string;
  available: number;
  reserved: number;
  total: number;
}

/** Default reservation TTL: 15 minutes */
const RESERVATION_TTL_MS = 15 * 60 * 1000;

/** In-memory stores */
const stockLevels: Map<string, number> = new Map();
const reservations: Map<string, StockReservation> = new Map();
const thresholds: Map<string, LowStockThreshold> = new Map();

/**
 * Set the initial stock level for a SKU.
 * Called when a product variant is created or stock is manually adjusted.
 */
export function setStock(sku: string, quantity: number): void {
  if (quantity < 0) throw new Error('Stock quantity cannot be negative');
  stockLevels.set(sku, quantity);
}

/**
 * Get the current stock level for a SKU, accounting for active reservations.
 */
export function getStockLevel(sku: string): StockLevel {
  const total = stockLevels.get(sku) ?? 0;
  const reserved = getActiveReservations(sku)
    .reduce((sum, r) => sum + r.quantity, 0);

  return {
    sku,
    available: Math.max(total - reserved, 0),
    reserved,
    total,
  };
}

/**
 * Reserve stock for a checkout session. The reservation expires after
 * RESERVATION_TTL_MS and the stock becomes available again.
 *
 * @throws Error if insufficient stock is available
 */
export function reserveStock(sku: string, quantity: number, sessionId: string): StockReservation {
  const level = getStockLevel(sku);
  if (level.available < quantity) {
    throw new Error(`Insufficient stock for ${sku}: requested ${quantity}, available ${level.available}`);
  }

  const reservation: StockReservation = {
    id: `res_${Date.now().toString(36)}`,
    sku,
    quantity,
    expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
    sessionId,
  };

  reservations.set(reservation.id, reservation);
  return reservation;
}

/**
 * Confirm a reservation (order placed). Permanently decrements stock
 * and removes the reservation.
 */
export function confirmReservation(reservationId: string): void {
  const reservation = reservations.get(reservationId);
  if (!reservation) throw new Error(`Reservation not found: ${reservationId}`);

  const current = stockLevels.get(reservation.sku) ?? 0;
  stockLevels.set(reservation.sku, Math.max(current - reservation.quantity, 0));
  reservations.delete(reservationId);

  checkLowStock(reservation.sku);
}

/**
 * Release a reservation (cart abandoned or expired).
 */
export function releaseReservation(reservationId: string): void {
  reservations.delete(reservationId);
}

/** Get all non-expired reservations for a SKU */
function getActiveReservations(sku: string): StockReservation[] {
  const now = new Date();
  return Array.from(reservations.values())
    .filter(r => r.sku === sku && r.expiresAt > now);
}

/**
 * Configure a low-stock alert threshold for a SKU.
 */
export function setLowStockThreshold(config: LowStockThreshold): void {
  thresholds.set(config.sku, config);
}

/**
 * Check if a SKU has fallen below its low-stock threshold.
 * In production, this would trigger an email/webhook notification.
 */
function checkLowStock(sku: string): boolean {
  const config = thresholds.get(sku);
  if (!config) return false;

  const level = getStockLevel(sku);
  if (level.available <= config.threshold) {
    // In production: send notification to config.notifyEmail
    process.stderr.write(`[LOW STOCK] ${sku}: ${level.available} units remaining\n`);
    return true;
  }
  return false;
}
