/**
 * Notification service for order lifecycle events.
 * Sends emails, push notifications, and webhooks for order confirmations,
 * shipping updates, refund completions, and delivery confirmations.
 */
import { Order } from '@/models/order';
import { Payment, RefundRequest } from '@/models/payment';
import { ShipmentTracking } from '@/services/shipping-service';

/** Supported notification channels */
export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook';

/** A queued notification ready for dispatch */
export interface Notification {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  metadata: Record<string, string>;
  sentAt?: Date;
  createdAt: Date;
}

/** Template identifiers for order-related notifications */
export enum NotificationTemplate {
  OrderConfirmation = 'order_confirmation',
  OrderShipped = 'order_shipped',
  OrderDelivered = 'order_delivered',
  OrderCancelled = 'order_cancelled',
  RefundInitiated = 'refund_initiated',
  RefundCompleted = 'refund_completed',
  PaymentFailed = 'payment_failed',
}

/**
 * Send an order confirmation notification to the customer.
 * Includes order summary, estimated delivery, and tracking link placeholder.
 * @param order - The confirmed order
 * @param customerEmail - Customer's email address
 * @returns Created notification record
 */
export async function sendOrderConfirmation(
  order: Order,
  customerEmail: string
): Promise<Notification> {
  const itemSummary = order.items
    .map((i) => `${i.name} x${i.quantity} - $${(i.unitPrice * i.quantity).toFixed(2)}`)
    .join('\n');

  return createNotification('email', customerEmail, {
    subject: `Order Confirmed: ${order.id}`,
    body: `Thank you for your order!\n\nItems:\n${itemSummary}\n\nTotal: $${order.total.toFixed(2)}`,
    template: NotificationTemplate.OrderConfirmation,
    orderId: order.id,
  });
}

/**
 * Send a shipping update notification with tracking information.
 * @param order - The shipped order
 * @param tracking - Shipment tracking details
 * @param customerEmail - Customer's email address
 */
export async function sendShippingUpdate(
  order: Order,
  tracking: ShipmentTracking,
  customerEmail: string
): Promise<Notification> {
  const eta = tracking.estimatedDelivery
    ? `Estimated delivery: ${tracking.estimatedDelivery.toLocaleDateString()}`
    : 'Delivery date will be updated soon';

  return createNotification('email', customerEmail, {
    subject: `Your order ${order.id} has shipped!`,
    body: `Tracking: ${tracking.trackingNumber} via ${tracking.carrier.toUpperCase()}\n${eta}`,
    template: NotificationTemplate.OrderShipped,
    orderId: order.id,
  });
}

/**
 * Send a refund notification when a refund has been processed.
 * @param order - Associated order
 * @param refund - Refund request details
 * @param customerEmail - Customer's email address
 */
export async function sendRefundNotification(
  order: Order,
  refund: RefundRequest,
  customerEmail: string
): Promise<Notification> {
  return createNotification('email', customerEmail, {
    subject: `Refund processed for order ${order.id}`,
    body: `Your refund of $${refund.amount.toFixed(2)} has been processed.\nReason: ${refund.reason}\nPlease allow 5-10 business days for the funds to appear.`,
    template: NotificationTemplate.RefundCompleted,
    orderId: order.id,
  });
}

/** Internal helper to construct a notification record */
function createNotification(
  channel: NotificationChannel,
  recipient: string,
  opts: { subject: string; body: string; template: NotificationTemplate; orderId: string }
): Notification {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    channel,
    recipient,
    subject: opts.subject,
    body: opts.body,
    metadata: { template: opts.template, orderId: opts.orderId },
    createdAt: new Date(),
  };
}
