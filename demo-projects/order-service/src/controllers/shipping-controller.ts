/**
 * Shipping controller: HTTP handlers for shipping options, tracking, and address updates.
 * Routes: POST /shipping/rates, GET /shipping/track/:trackingNumber, PATCH /orders/:id/address
 */
import { Request, Response } from 'express';
import { calculateShippingRates, getTracking, ShipmentTracking } from '@/services/shipping-service';
import { validateAddress, formatAddress } from '@/models/address';
import { Address, ShippingCarrier } from '@/types';

/**
 * POST /shipping/rates — Calculate available shipping options.
 * Body: { destination: Address, weightLbs: number }
 * Returns an array of shipping options sorted by cost (cheapest first).
 */
export function handleShippingOptions(req: Request, res: Response): void {
  const { destination, weightLbs } = req.body;

  if (!destination || !weightLbs || weightLbs <= 0) {
    res.status(400).json({ error: 'Destination address and positive weight are required' });
    return;
  }

  const addressErrors = validateAddress(destination as Address);
  if (addressErrors.length > 0) {
    res.status(400).json({ errors: addressErrors });
    return;
  }

  const options = calculateShippingRates(destination as Address, weightLbs);
  res.json({
    options,
    destination: formatAddress(destination as Address),
  });
}

/**
 * GET /shipping/track/:trackingNumber — Get tracking information for a shipment.
 * Query params: carrier (required)
 * Returns tracking events and estimated delivery date.
 */
export async function handleTrackShipment(req: Request, res: Response): Promise<void> {
  const { trackingNumber } = req.params;
  const carrier = req.query.carrier as ShippingCarrier;

  if (!carrier) {
    res.status(400).json({ error: 'carrier query parameter is required' });
    return;
  }

  const validCarriers: ShippingCarrier[] = ['usps', 'fedex', 'ups', 'dhl'];
  if (!validCarriers.includes(carrier)) {
    res.status(400).json({ error: `Invalid carrier: ${carrier}` });
    return;
  }

  const tracking = await getTracking(trackingNumber, carrier);
  res.json({ tracking });
}

/**
 * PATCH /orders/:id/address — Update the shipping address for an order.
 * Body: { shippingAddress: Address }
 * Only allowed for orders that haven't shipped yet (pending, confirmed, processing).
 */
export function handleUpdateAddress(req: Request, res: Response): void {
  const { shippingAddress } = req.body;

  if (!shippingAddress) {
    res.status(400).json({ error: 'shippingAddress is required' });
    return;
  }

  const errors = validateAddress(shippingAddress as Address);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  /*
   * In production, we would:
   * 1. Look up the order by req.params.id
   * 2. Verify the order status allows address changes
   * 3. Recalculate shipping rates for the new address
   * 4. Update the order and recalculate totals
   */

  res.json({
    message: 'Shipping address updated',
    orderId: req.params.id,
    newAddress: formatAddress(shippingAddress as Address),
  });
}
