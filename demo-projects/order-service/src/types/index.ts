/**
 * Shared types for the ShopFlow Order Service.
 * All domain models, enums, and DTOs used across controllers and services.
 */

/** Order lifecycle states following the state machine in docs/order-state-machine.md */
export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Refunded = 'refunded',
}

/** Payment processing states */
export enum PaymentStatus {
  Pending = 'pending',
  Authorized = 'authorized',
  Captured = 'captured',
  Failed = 'failed',
  Refunded = 'refunded',
  PartialRefund = 'partial_refund',
}

/** Supported payment methods */
export enum PaymentMethod {
  CreditCard = 'credit_card',
  DebitCard = 'debit_card',
  PayPal = 'paypal',
  BankTransfer = 'bank_transfer',
  Crypto = 'crypto',
}

/** Shipping carrier identifiers */
export type ShippingCarrier = 'usps' | 'fedex' | 'ups' | 'dhl';

/** Available shipping speed tiers */
export interface ShippingOption {
  carrier: ShippingCarrier;
  method: string;
  estimatedDays: number;
  cost: number;
  currency: string;
}

/** Line item within an order or cart */
export interface LineItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

/** Postal address for shipping and billing */
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

/** Tax breakdown for an order */
export interface TaxBreakdown {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  exemptions: string[];
}

/** Pagination parameters for list endpoints */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
