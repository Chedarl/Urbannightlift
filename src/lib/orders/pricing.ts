/**
 * Where a delivery fee comes from.
 *
 * **The rule changed.** It used to be the zone tier and nothing else, which
 * meant a 600 m hop across a RED zone cost more than an 8 km ride inside a
 * GREEN one, and two neighbours either side of a zone line paid double each
 * other. Customers complained and were right.
 *
 * The fee is now distance-led — see `src/lib/orders/fare.ts` for the model and
 * the reasoning. This module keeps the same entry point so every screen that
 * already asks for a fee carries on working, and hands the actual decision to
 * `quoteFare`.
 *
 * Zones did not go away. They still decide which tier a place is in, and the
 * tier is still a modifier on the total — it is simply no longer the whole
 * answer.
 */
import { quoteFare, type FareRules, type ZoneTier as FareTier } from "@/lib/orders/fare";
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
 * The fee for a delivery.
 *
 * Distance decides it when both ends are pinned; the zone tier nudges it; the
 * medicine surcharge is added on top as it always was. With no pins it falls
 * back to the minimum plus the tier modifier and the caller is told, through
 * `quoteDeliveryFee`, that the figure is an estimate.
 *
 * The signature is unchanged apart from two optional arguments, so all six
 * existing call sites keep working while the ones that know where the customer
 * actually is start pricing honestly.
 */
export function estimateDeliveryFee(
  pickupZone: ZonePricing | null,
  deliveryZone: ZonePricing | null,
  options: {
    isMedicine?: boolean;
    /** Both ends, when the customer has pinned them. */
    pickup?: { lat: number; lng: number } | null;
    delivery?: { lat: number; lng: number } | null;
    rules?: FareRules;
    busy?: boolean;
    /** The rider shops or collects, rather than only carrying. */
    errand?: boolean;
    /** Hour of day, 0-23, for the late-night band. */
    hour?: number;
  } = {}
): number | null {
  return quoteDeliveryFee(pickupZone, deliveryZone, options)?.totalXaf ?? null;
}

/**
 * The same answer, with its working shown.
 *
 * Preferred wherever there is room on the screen for it: a customer who can see
 * *why* a price is what it is argues with it far less than one handed a number.
 * "You are 6 km away" is a reason; "you are in the red zone" is a rule.
 */
export function quoteDeliveryFee(
  pickupZone: ZonePricing | null,
  deliveryZone: ZonePricing | null,
  options: {
    isMedicine?: boolean;
    pickup?: { lat: number; lng: number } | null;
    delivery?: { lat: number; lng: number } | null;
    rules?: FareRules;
    busy?: boolean;
    /** The rider shops or collects, rather than only carrying. */
    errand?: boolean;
    /** Hour of day in Yaoundé, 0-23, for the late-night band. */
    hour?: number;
  } = {}
) {
  const km =
    options.pickup && options.delivery
      ? distanceKm(options.pickup.lat, options.pickup.lng, options.delivery.lat, options.delivery.lng)
      : null;

  /*
   * What we need before a price exists — and this changed with the fee model.
   *
   * Under the old rule the fee *was* the zone tariff, so no zone meant no
   * price and this function bailed out. That early return survived the v37
   * rewrite and became a real defect: a customer who drops **two pins** hands
   * us the exact distance, which is now the whole basis of the fee, and was
   * still being told the order needed a human to price it. Every such order
   * landed in the dispatcher review queue for somebody to type a number the
   * system had already worked out.
   *
   * So the requirement is now: a distance **or** a zone. With neither there is
   * genuinely nothing to go on and a person prices it, as before.
   */
  if (km == null && !deliveryZone && !pickupZone) return null;

  // The harder of the two ends decides the modifier: a rider has to reach both.
  const tiers: FareTier[] = [pickupZone?.tier, deliveryZone?.tier].filter(Boolean) as FareTier[];
  const tier: FareTier = tiers.includes("RED")
    ? "RED"
    : tiers.includes("YELLOW")
      ? "YELLOW"
      : "GREEN";

  const surchargeXaf = options.isMedicine
    ? Math.max(pickupZone?.medicineFeeXaf ?? 0, deliveryZone?.medicineFeeXaf ?? 0)
    : 0;

  return quoteFare({ km, tier, surchargeXaf, busy: options.busy, errand: options.errand, hour: options.hour }, options.rules);
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
