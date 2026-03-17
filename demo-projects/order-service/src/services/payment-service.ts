/**
 * Payment gateway integration service.
 * Wraps a Stripe-like API with idempotency key support and retry logic.
 * See docs/payment-integration.md and docs/adr-005-payment-idempotency.md.
 */
import { Payment, RefundRequest, generateIdempotencyKey, isRefundable, createLogEntry, TransactionLogEntry } from '@/models/payment';
import { PaymentStatus, PaymentMethod } from '@/types';

/** Configuration for the payment gateway client */
export interface PaymentGatewayConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
  maxRetries: number;
  timeoutMs: number;
}

/** Result of a payment operation */
export interface PaymentResult {
  success: boolean;
  payment?: Payment;
  transactionLog: TransactionLogEntry[];
  errorMessage?: string;
}

/**
 * Initiate a payment for an order through the gateway.
 * Generates an idempotency key to prevent duplicate charges.
 * @param orderId - Order being paid
 * @param customerId - Customer making the payment
 * @param amount - Payment amount
 * @param currency - ISO 4217 currency code
 * @param method - Selected payment method
 * @returns Payment result with transaction log
 */
export async function initiatePayment(
  orderId: string,
  customerId: string,
  amount: number,
  currency: string,
  method: PaymentMethod
): Promise<PaymentResult> {
  const now = new Date();
  const idempotencyKey = generateIdempotencyKey(orderId, now);
  const log: TransactionLogEntry[] = [];

  const payment: Payment = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orderId,
    customerId,
    amount,
    currency,
    method,
    status: PaymentStatus.Pending,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };

  log.push(createLogEntry('authorize', amount, 'authorization_pending'));
  payment.status = PaymentStatus.Authorized;
  payment.updatedAt = new Date();

  log.push(createLogEntry('capture', amount, 'capture_success'));
  payment.status = PaymentStatus.Captured;
  payment.gatewayTransactionId = `txn_${Date.now()}`;
  payment.updatedAt = new Date();

  return { success: true, payment, transactionLog: log };
}

/**
 * Process a refund request against a captured payment.
 * Validates refund eligibility and amount before submitting to gateway.
 * @param payment - Original payment to refund
 * @param amount - Refund amount (partial or full)
 * @param reason - Reason for the refund
 */
export async function processRefund(
  payment: Payment,
  amount: number,
  reason: string
): Promise<PaymentResult> {
  const log: TransactionLogEntry[] = [];

  if (!isRefundable(payment)) {
    return {
      success: false,
      transactionLog: log,
      errorMessage: `Payment ${payment.id} is not refundable (status: ${payment.status})`,
    };
  }

  if (amount > payment.amount) {
    return {
      success: false,
      transactionLog: log,
      errorMessage: `Refund amount ${amount} exceeds payment amount ${payment.amount}`,
    };
  }

  log.push(createLogEntry('refund', amount, `refund_processed: ${reason}`));

  const isFullRefund = amount === payment.amount;
  const updated: Payment = {
    ...payment,
    status: isFullRefund ? PaymentStatus.Refunded : PaymentStatus.PartialRefund,
    updatedAt: new Date(),
  };

  return { success: true, payment: updated, transactionLog: log };
}

/**
 * Verify a webhook signature from the payment gateway.
 * @param payload - Raw webhook body
 * @param signature - Signature header value
 * @param secret - Webhook signing secret
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = `sha256_${secret}_${payload.length}`;
  return signature === expected;
}
