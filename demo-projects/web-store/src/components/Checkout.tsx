/**
 * Multi-step checkout flow for the ShopFlow Web Store.
 *
 * Guides the user through four sequential steps: address selection,
 * shipping method, payment entry, and order confirmation. Each step
 * validates before allowing progression to the next.
 * @module components/Checkout
 */

import React, { useState, useCallback } from 'react';
import type { CheckoutStep, ShippingAddress, PaymentMethod, CartItem } from '@/types';
import { post } from '@/services/api-client';

/** Ordered list of checkout steps for progress display */
const STEPS: CheckoutStep[] = ['address', 'shipping', 'payment', 'confirmation'];

/** Labels shown in the step progress indicator */
const STEP_LABELS: Record<CheckoutStep, string> = {
  address: 'Address',
  shipping: 'Shipping',
  payment: 'Payment',
  confirmation: 'Confirm',
};

/** Props for the Checkout component */
interface CheckoutProps {
  items: CartItem[];
  subtotal: number;
  addresses: ShippingAddress[];
  onComplete: (orderId: string) => void;
  onCancel: () => void;
}

/** Internal checkout form state accumulated across all steps */
interface CheckoutState {
  addressId: string | null;
  shippingMethod: 'standard' | 'express' | 'overnight';
  paymentMethod: PaymentMethod;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Checkout component implementing a linear multi-step form.
 * Each step must be valid before the user can advance.
 * The final confirmation step submits the order to the API.
 */
export const Checkout: React.FC<CheckoutProps> = ({
  items, subtotal, addresses, onComplete, onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('address');
  const [state, setState] = useState<CheckoutState>({
    addressId: addresses.find((a) => a.isDefault)?.id ?? null,
    shippingMethod: 'standard',
    paymentMethod: 'credit_card',
    isSubmitting: false,
    error: null,
  });

  const currentIndex = STEPS.indexOf(currentStep);
  const selectedAddress = addresses.find((a) => a.id === state.addressId);

  /** Calculate shipping cost based on chosen method */
  const shippingCost = state.shippingMethod === 'overnight' ? 24.99
    : state.shippingMethod === 'express' ? 12.99 : 5.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shippingCost + tax;

  const goNext = useCallback(() => {
    if (currentIndex < STEPS.length - 1) setCurrentStep(STEPS[currentIndex + 1]);
  }, [currentIndex]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) setCurrentStep(STEPS[currentIndex - 1]);
  }, [currentIndex]);

  /** Submit the order to the API on the confirmation step */
  const handleSubmit = useCallback(async () => {
    if (!state.addressId) return;
    setState((s) => ({ ...s, isSubmitting: true, error: null }));
    try {
      const order = await post<{ id: string }>('/orders', {
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
        addressId: state.addressId,
        shippingMethod: state.shippingMethod,
        paymentMethod: state.paymentMethod,
      });
      onComplete(order.id);
    } catch (err) {
      setState((s) => ({
        ...s,
        isSubmitting: false,
        error: err instanceof Error ? err.message : 'Order submission failed',
      }));
    }
  }, [items, state, onComplete]);

  return (
    <div className="checkout" role="main" aria-label="Checkout">
      <nav className="checkout__progress" aria-label="Checkout steps">
        {STEPS.map((step, idx) => (
          <div
            key={step}
            className={`checkout__step ${idx <= currentIndex ? 'checkout__step--active' : ''}`}
            aria-current={step === currentStep ? 'step' : undefined}
          >
            <span className="checkout__step-number">{idx + 1}</span>
            <span className="checkout__step-label">{STEP_LABELS[step]}</span>
          </div>
        ))}
      </nav>

      {state.error && <div className="checkout__error" role="alert">{state.error}</div>}

      {currentStep === 'address' && (
        <section className="checkout__section" aria-label="Select shipping address">
          <h2>Shipping Address</h2>
          <ul className="checkout__address-list" role="radiogroup">
            {addresses.map((addr) => (
              <li key={addr.id}>
                <label>
                  <input
                    type="radio"
                    name="address"
                    checked={state.addressId === addr.id}
                    onChange={() => setState((s) => ({ ...s, addressId: addr.id }))}
                  />
                  <span>{addr.label} &mdash; {addr.street}, {addr.city}, {addr.state} {addr.postalCode}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {currentStep === 'shipping' && (
        <section className="checkout__section" aria-label="Select shipping method">
          <h2>Shipping Method</h2>
          {(['standard', 'express', 'overnight'] as const).map((method) => (
            <label key={method} className="checkout__shipping-option">
              <input
                type="radio"
                name="shipping"
                checked={state.shippingMethod === method}
                onChange={() => setState((s) => ({ ...s, shippingMethod: method }))}
              />
              <span>{method.charAt(0).toUpperCase() + method.slice(1)}</span>
            </label>
          ))}
        </section>
      )}

      {currentStep === 'payment' && (
        <section className="checkout__section" aria-label="Payment method">
          <h2>Payment</h2>
          {(['credit_card', 'paypal', 'apple_pay', 'google_pay'] as PaymentMethod[]).map((pm) => (
            <label key={pm} className="checkout__payment-option">
              <input
                type="radio"
                name="payment"
                checked={state.paymentMethod === pm}
                onChange={() => setState((s) => ({ ...s, paymentMethod: pm }))}
              />
              <span>{pm.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
            </label>
          ))}
        </section>
      )}

      {currentStep === 'confirmation' && (
        <section className="checkout__section" aria-label="Order confirmation">
          <h2>Review Your Order</h2>
          <p>Shipping to: {selectedAddress?.street}, {selectedAddress?.city}</p>
          <p>Method: {state.shippingMethod} (${shippingCost.toFixed(2)})</p>
          <p>Items: {items.length} &mdash; Subtotal: ${subtotal.toFixed(2)}</p>
          <p>Tax: ${tax.toFixed(2)}</p>
          <p><strong>Total: ${total.toFixed(2)}</strong></p>
        </section>
      )}

      <div className="checkout__actions">
        <button onClick={currentIndex === 0 ? onCancel : goBack}>
          {currentIndex === 0 ? 'Cancel' : 'Back'}
        </button>
        {currentStep === 'confirmation' ? (
          <button onClick={handleSubmit} disabled={state.isSubmitting}>
            {state.isSubmitting ? 'Placing Order...' : 'Place Order'}
          </button>
        ) : (
          <button onClick={goNext} disabled={currentStep === 'address' && !state.addressId}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
};
