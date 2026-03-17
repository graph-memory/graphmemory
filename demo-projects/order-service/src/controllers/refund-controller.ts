/**
 * Refund controller: HTTP handlers for refund requests, approval, and status.
 * Routes: POST /refunds, POST /refunds/:id/approve, GET /refunds/:id
 */
import { Request, Response } from 'express';
import { processRefund, PaymentResult } from '@/services/payment-service';
import { Payment, RefundRequest, isRefundable } from '@/models/payment';
import { PaymentStatus } from '@/types';

/** In-memory refund store */
const refunds = new Map<string, RefundRequest>();

/** Reference to payment store (shared with payment controller in production) */
const payments = new Map<string, Payment>();

/**
 * POST /refunds — Request a refund for a payment.
 * Body: { paymentId, amount, reason }
 * Creates a pending refund request that must be approved before processing.
 */
export function handleRequestRefund(req: Request, res: Response): void {
  const { paymentId, orderId, amount, reason } = req.body;

  if (!paymentId || !amount || amount <= 0) {
    res.status(400).json({ error: 'Invalid refund parameters' });
    return;
  }

  if (!reason?.trim()) {
    res.status(400).json({ error: 'Refund reason is required' });
    return;
  }

  const refund: RefundRequest = {
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    paymentId,
    orderId: orderId ?? '',
    amount,
    reason,
    status: 'pending',
    createdAt: new Date(),
  };

  refunds.set(refund.id, refund);
  res.status(201).json({ refund });
}

/**
 * POST /refunds/:id/approve — Approve and process a pending refund.
 * Body: { approvedBy: string }
 * Only pending refunds can be approved. Processing happens synchronously.
 */
export async function handleApproveRefund(req: Request, res: Response): Promise<void> {
  const refund = refunds.get(req.params.id);
  if (!refund) {
    res.status(404).json({ error: 'Refund request not found' });
    return;
  }

  if (refund.status !== 'pending') {
    res.status(422).json({ error: `Refund is already ${refund.status}` });
    return;
  }

  const payment = payments.get(refund.paymentId);
  if (!payment) {
    res.status(404).json({ error: 'Associated payment not found' });
    return;
  }

  const result = await processRefund(payment, refund.amount, refund.reason);

  if (!result.success) {
    refund.status = 'rejected';
    res.status(422).json({ error: result.errorMessage });
    return;
  }

  refund.status = 'processed';
  refund.approvedBy = req.body.approvedBy;
  refund.processedAt = new Date();

  payments.set(payment.id, result.payment!);
  refunds.set(refund.id, refund);

  res.json({ refund, payment: result.payment });
}

/**
 * GET /refunds/:id — Get the current status of a refund request.
 */
export function handleRefundStatus(req: Request, res: Response): void {
  const refund = refunds.get(req.params.id);
  if (!refund) {
    res.status(404).json({ error: 'Refund request not found' });
    return;
  }
  res.json({ refund });
}
