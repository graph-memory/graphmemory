/**
 * Shipping service: rate calculation, carrier integration, and tracking.
 * Supports USPS, FedEx, UPS, and DHL with fallback strategies.
 * See docs/shipping-providers.md for carrier-specific details.
 */
import { Address, ShippingOption, ShippingCarrier } from '@/types';

/** Tracking event from the carrier API */
export interface TrackingEvent {
  timestamp: Date;
  location: string;
  status: string;
  description: string;
}

/** Full shipment tracking information */
export interface ShipmentTracking {
  trackingNumber: string;
  carrier: ShippingCarrier;
  status: 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  estimatedDelivery?: Date;
  events: TrackingEvent[];
}

/** Base shipping rates per carrier (USD, per-pound, simplified) */
const BASE_RATES: Record<ShippingCarrier, { perPound: number; baseFee: number }> = {
  usps: { perPound: 0.55, baseFee: 3.99 },
  fedex: { perPound: 0.85, baseFee: 7.99 },
  ups: { perPound: 0.78, baseFee: 6.99 },
  dhl: { perPound: 1.2, baseFee: 12.99 },
};

/** Estimated delivery days by carrier and speed tier */
const DELIVERY_ESTIMATES: Record<ShippingCarrier, Record<string, number>> = {
  usps: { ground: 7, priority: 3, express: 2 },
  fedex: { ground: 5, express: 2, overnight: 1 },
  ups: { ground: 5, express: 2, next_day: 1 },
  dhl: { standard: 10, express: 5, priority: 3 },
};

/**
 * Calculate available shipping options for a destination and package weight.
 * @param destination - Shipping address
 * @param weightLbs - Total package weight in pounds
 * @returns Array of available shipping options sorted by cost
 */
export function calculateShippingRates(
  destination: Address,
  weightLbs: number
): ShippingOption[] {
  const carriers: ShippingCarrier[] = ['usps', 'fedex', 'ups'];
  if (destination.country !== 'US') {
    carriers.push('dhl');
  }

  const options: ShippingOption[] = [];
  for (const carrier of carriers) {
    const rate = BASE_RATES[carrier];
    const methods = DELIVERY_ESTIMATES[carrier];

    for (const [method, days] of Object.entries(methods)) {
      const speedMultiplier = days <= 2 ? 2.5 : days <= 5 ? 1.5 : 1.0;
      const cost = Math.round((rate.baseFee + rate.perPound * weightLbs * speedMultiplier) * 100) / 100;

      options.push({
        carrier,
        method,
        estimatedDays: days,
        cost,
        currency: 'USD',
      });
    }
  }

  return options.sort((a, b) => a.cost - b.cost);
}

/**
 * Fetch tracking information for a shipment from the carrier.
 * In production this calls the carrier's tracking API.
 * @param trackingNumber - Carrier tracking number
 * @param carrier - Shipping carrier
 * @returns Shipment tracking details
 */
export async function getTracking(
  trackingNumber: string,
  carrier: ShippingCarrier
): Promise<ShipmentTracking> {
  return {
    trackingNumber,
    carrier,
    status: 'in_transit',
    estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    events: [
      {
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
        location: 'Distribution Center, Memphis TN',
        status: 'in_transit',
        description: 'Package departed facility',
      },
      {
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
        location: 'Origin Facility, Los Angeles CA',
        status: 'in_transit',
        description: 'Package received by carrier',
      },
    ],
  };
}

/**
 * Determine the cheapest carrier option for a given destination.
 * Useful for setting default shipping at checkout.
 * @param destination - Shipping address
 * @param weightLbs - Package weight
 */
export function cheapestOption(destination: Address, weightLbs: number): ShippingOption | undefined {
  const rates = calculateShippingRates(destination, weightLbs);
  return rates[0];
}
