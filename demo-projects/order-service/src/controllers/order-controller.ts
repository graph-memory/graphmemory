/**
 * Order controller: HTTP request handlers for order CRUD operations.
 * Routes: POST /orders, GET /orders/:id, GET /orders, POST /orders/:id/cancel
 */
import { Request, Response } from 'express';
import { createOrder, transitionOrder, validateOrderItems, CreateOrderParams } from '@/services/order-service';
import { sendOrderConfirmation } from '@/services/notification-service';
import { OrderStatus } from '@/types';
import { Order } from '@/models/order';

/** In-memory order store (replaced by database in production) */
const orders = new Map<string, Order>();

/**
 * POST /orders — Create a new order from checkout data.
 * Validates items, computes totals, and sends confirmation email.
 */
export async function handleCreateOrder(req: Request, res: Response): Promise<void> {
  const params: CreateOrderParams = req.body;

  const itemErrors = validateOrderItems(params.items);
  if (itemErrors.length > 0) {
    res.status(400).json({ errors: itemErrors });
    return;
  }

  const order = createOrder(params);
  orders.set(order.id, order);

  await sendOrderConfirmation(order, req.body.customerEmail);

  res.status(201).json({ order });
}

/**
 * GET /orders/:id — Retrieve a single order by ID.
 * Returns 404 if the order does not exist.
 */
export function handleGetOrder(req: Request, res: Response): void {
  const order = orders.get(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order });
}

/**
 * GET /orders — List orders with optional filtering by customer and status.
 * Query params: customerId, status, page, limit
 */
export function handleListOrders(req: Request, res: Response): void {
  let result = Array.from(orders.values());

  const { customerId, status, page = '1', limit = '20' } = req.query;

  if (typeof customerId === 'string') {
    result = result.filter((o) => o.customerId === customerId);
  }
  if (typeof status === 'string') {
    result = result.filter((o) => o.status === status);
  }

  const pageNum = Math.max(1, parseInt(page as string, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
  const start = (pageNum - 1) * pageSize;

  res.json({
    orders: result.slice(start, start + pageSize),
    total: result.length,
    page: pageNum,
    limit: pageSize,
  });
}

/**
 * POST /orders/:id/cancel — Cancel an order if it hasn't been shipped yet.
 * Only pending, confirmed, and processing orders can be cancelled.
 */
export function handleCancelOrder(req: Request, res: Response): void {
  const order = orders.get(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const result = transitionOrder(order, OrderStatus.Cancelled);
  if (!result.success) {
    res.status(422).json({ error: result.error });
    return;
  }

  orders.set(order.id, result.order!);
  res.json({ order: result.order });
}
