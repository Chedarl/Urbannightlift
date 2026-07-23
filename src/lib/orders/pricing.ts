/**
 * Simple fixed-zone pricing for the MVP (no distance calculation).
 * Same zone -> pickup zone's base fee; different zones -> the higher of the
 * two zones' nearby fees; surcharges (medicine) added on top. All figures are
 * admin-editable on the Zone model — nothing here is hardcoded pricing.
 */

export interface ZonePricing {
  id: string;
  feeXaf: number;
  nearbyFeeXaf: number | null;
  extendedFeeXaf: number | null;
  medicineFeeXaf: number;
  nightUrgencyFeeXaf: number;
}

export function estimateDeliveryFee(
  pickupZone: ZonePricing | null,
  deliveryZone: ZonePricing | null,
  options: { isMedicine?: boolean } = {}
): number | null {
  if (!pickupZone || !deliveryZone) return null;

  let base: number;
  if (pickupZone.id === deliveryZone.id) {
    base = pickupZone.feeXaf;
  } else {
    const a = pickupZone.nearbyFeeXaf ?? pickupZone.feeXaf;
    const b = deliveryZone.nearbyFeeXaf ?? deliveryZone.feeXaf;
    base = Math.max(a, b);
  }

  if (options.isMedicine) {
    base += Math.max(pickupZone.medicineFeeXaf, deliveryZone.medicineFeeXaf);
  }

  return base;
}
