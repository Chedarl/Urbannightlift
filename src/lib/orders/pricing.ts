/**
 * Tier-based zone pricing. The delivery fee is driven by the DELIVERY zone's
 * tier fee (GREEN 1000–1500, YELLOW 1600–2000, RED 2500+), with an optional
 * medicine surcharge. All figures are admin-editable on the Zone model.
 */
export type ZoneTier = "GREEN" | "YELLOW" | "RED";

export interface ZonePricing {
  id: string;
  feeXaf: number;
  medicineFeeXaf: number;
  nightUrgencyFeeXaf: number;
  tier: ZoneTier;
}

export const TIER_META: Record<ZoneTier, { label: string; labelFr: string; tone: "safe" | "caution" | "restricted"; hex: string }> = {
  GREEN: { label: "Green zone", labelFr: "Zone verte", tone: "safe", hex: "#2fae60" },
  YELLOW: { label: "Yellow zone", labelFr: "Zone jaune", tone: "caution", hex: "#d4af37" },
  RED: { label: "Red zone", labelFr: "Zone rouge", tone: "restricted", hex: "#e0522f" },
};

/**
 * Delivery fee = delivery zone tier fee, or the higher of pickup/delivery when
 * both are known. Medicine surcharge added on top.
 */
export function estimateDeliveryFee(
  pickupZone: ZonePricing | null,
  deliveryZone: ZonePricing | null,
  options: { isMedicine?: boolean } = {}
): number | null {
  const zone = deliveryZone ?? pickupZone;
  if (!zone) return null;

  let base = deliveryZone?.feeXaf ?? pickupZone?.feeXaf ?? 0;
  if (pickupZone && deliveryZone) base = Math.max(pickupZone.feeXaf, deliveryZone.feeXaf);

  if (options.isMedicine) {
    base += Math.max(pickupZone?.medicineFeeXaf ?? 0, deliveryZone?.medicineFeeXaf ?? 0);
  }
  return base;
}

/** Haversine distance in km between two lat/lng points. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface ZoneWithCentroid {
  id: string;
  zoneName: string;
  tier: ZoneTier;
  feeXaf: number;
  centroidLat: number | null;
  centroidLng: number | null;
}

/** Resolve a dropped map pin to the nearest zone that has a centroid. */
export function nearestZone<T extends ZoneWithCentroid>(lat: number, lng: number, zones: T[]): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    if (z.centroidLat == null || z.centroidLng == null) continue;
    const d = distanceKm(lat, lng, z.centroidLat, z.centroidLng);
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best;
}
