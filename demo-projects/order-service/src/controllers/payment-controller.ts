/**
 * Payment controller: HTTP handlers for payment initiation, webhooks, and status.
 * Routes: POST /payments, POST /payments/webhook, GET /payments/:id/status
 * See docs/payment-integration.md for Stripe integration details.
 */
import { Request, Response } from 'express';
import { initiatePayment, verifyWebhookSignature } from '@/services/payment-service';
import { Payment } from '@/models/payment';
import { PaymentMethod } from '@/types';

/** In-memory payment store (replaced by database in production) */
const payments = new Map<string, Payment>();

/** Webhook signing secret from environment */
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_default';

/**
 * POST /payments — Initiate a payment for an order.
 * Body: { orderId, customerId, amount, currency, method }
 * Returns the payment record with gateway transaction details.
 */
export async function handleInitiatePayment(req: Request, res: Response): Promise<void> {
  const { orderId, customerId, amount, currency, method } = req.body;

  if (!orderId || !amount || amount <= 0) {
    res.status(400).json({ error: 'Invalid payment parameters' });
    return;
  }

  const validMethods: PaymentMethod[] = Object.values(PaymentMethod);
  if (!validMethods.includes(method)) {
    res.status(400).json({ error: `Invalid payment method: ${method}` });
    return;
  }

  const result = await initiatePayment(orderId, customerId, amount, currency, method);

  if (!result.success) {
    res.status(422).json({ error: result.errorMessage });
    return;
  }

  payments.set(result.payment!.id, result.payment!);
  res.status(201).json({
    payment: result.payment,
    transactionLog: result.transactionLog,
  });
}

/**
 * POST /payments/webhook — Handle payment gateway webhook callbacks.
 * Verifies the signature header before processing the event.
 * Supports events: payment_intent.succeeded, payment_intent.failed, charge.refunded
 */
export function handlePaymentWebhook(req: Request, res: Response): void {
  const signature = req.headers['stripe-signature'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  const event = req.body;
  const eventType: string = event.type;

  switch (eventType) {
    case 'payment_intent.succeeded':
      process.stderr.write(`Payment succeeded: ${event.data.id}\n`);
      break;
    case 'payment_intent.failed':
      process.stderr.write(`Payment failed: ${event.data.id}\n`);
      break;
    case 'charge.refunded':
      process.stderr.write(`Charge refunded: ${event.data.id}\n`);
      break;
    default:
      process.stderr.write(`Unhandled webhook event: ${eventType}\n`);
  }

  res.status(200).json({ received: true });
}

/**
 * GET /payments/:id/status — Check the current status of a payment.
 * Returns the payment status, gateway transaction ID, and timestamps.
 */
export function handlePaymentStatus(req: Request, res: Response): void {
  const payment = payments.get(req.params.id);
  if (!payment) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }

  res.json({
    id: payment.id,
    status: payment.status,
    gatewayTransactionId: payment.gatewayTransactionId,
    amount: payment.amount,
    currency: payment.currency,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  });
}
