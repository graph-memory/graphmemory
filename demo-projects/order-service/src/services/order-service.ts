/**
 * Order service: state machine orchestration, validation, and total computation.
 * Coordinates between cart, payment, and shipping services to fulfill orders.
 */
import { Order, isValidTransition, computeOrderTotal } from '@/models/order';
import { OrderStatus, LineItem, Address, TaxBreakdown } from '@/types';
import { calculateSubtotal } from '@/utils/price-calc';
import { computeTax } from '@/utils/tax';

/** Parameters for creating a new order from a checked-out cart */
export interface CreateOrderParams {
  customerId: string;
  items: LineItem[];
  shippingAddress: Address;
  billingAddress: Address;
  shippingCost: number;
  currency: string;
}

/** Result of an order state transition attempt */
export interface TransitionResult {
  success: boolean;
  order?: Order;
  error?: string;
}

/**
 * Create a new order from checkout parameters.
 * Computes subtotals, tax, and total before persisting.
 * @param params - Order creation parameters
 * @returns Newly created order in Pending status
 */
export function createOrder(params: CreateOrderParams): Order {
  const subtotal = calculateSubtotal(params.items);
  const tax = computeTax(subtotal, params.shippingAddress.state);
  const total = computeOrderTotal(params.items, tax, params.shippingCost);
  const now = new Date();

  return {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customerId: params.customerId,
    status: OrderStatus.Pending,
    items: params.items,
    shippingAddress: params.shippingAddress,
    billingAddress: params.billingAddress,
    subtotal,
    tax,
    shippingCost: params.shippingCost,
    total,
    currency: params.currency,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Attempt to transition an order to a new status.
 * Validates the transition against the state machine before applying.
 * @param order - Current order
 * @param targetStatus - Desired new status
 * @returns Transition result with updated order or error message
 */
export function transitionOrder(order: Order, targetStatus: OrderStatus): TransitionResult {
  if (!isValidTransition(order.status, targetStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${order.status} to ${targetStatus}`,
    };
  }

  const updated: Order = {
    ...order,
    status: targetStatus,
    updatedAt: new Date(),
  };

  return { success: true, order: updated };
}

/**
 * Validate that all items in an order have positive quantities and prices.
 * @param items - Line items to validate
 * @returns Array of validation error messages
 */
export function validateOrderItems(items: LineItem[]): string[] {
  const errors: string[] = [];
  if (items.length === 0) {
    errors.push('Order must contain at least one item');
  }
  for (const item of items) {
    if (item.quantity <= 0) {
      errors.push(`Item ${item.sku}: quantity must be positive`);
    }
    if (item.unitPrice < 0) {
      errors.push(`Item ${item.sku}: price cannot be negative`);
    }
  }
  return errors;
}

/**
 * Recalculate order totals after item modifications.
 * Used when applying post-creation adjustments (e.g., partial cancellation).
 * @param order - Order to recalculate
 * @returns Updated order with recalculated subtotal, tax, and total
 */
export function recalculateOrder(order: Order): Order {
  const subtotal = calculateSubtotal(order.items);
  const tax: TaxBreakdown = computeTax(subtotal, order.shippingAddress.state);
  const total = computeOrderTotal(order.items, tax, order.shippingCost);

  return { ...order, subtotal, tax, total, updatedAt: new Date() };
}
