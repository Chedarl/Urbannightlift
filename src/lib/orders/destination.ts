/**
 * Where the tracking map should say the order is going.
 *
 * ## Why this needed a fallback at all
 *
 * Yaoundé largely does not use street addresses. People give a quartier and a
 * landmark — "Mvan, near the Total station" — and the whole address stack in
 * this product is built around that. So the exact pin is frequently missing:
 * either the customer never dropped one, or the geocoder could not place what
 * they typed.
 *
 * The tracking screen used to treat a missing pin as nothing at all. No
 * destination marker, no route line, and **no arrival time** — the ETA is
 * computed rider-to-destination and was suppressed outright without one. None
 * of that was said anywhere. The map simply showed less, and a rider watching
 * a customer stare at it would be right to say "the tracking does not work".
 *
 * ## The rule
 *
 * Exact pin first. Failing that, the centre of the drop-off zone — which is
 * about a kilometre loose, useless for the last hundred metres and perfectly
 * good for *how far away is he*, the one question the screen exists to answer.
 * Failing both, null, because inventing a point is worse than admitting there
 * isn't one.
 *
 * The result always carries `approximate`, so the screen can draw a guess as a
 * guess. An estimate rendered as a pin is how somebody ends up at the wrong
 * gate.
 *
 * Pure, and proved by `scripts/verify-destination.ts`.
 */

export interface Destination {
  lat: number;
  lng: number;
  /** True when this is a zone centre rather than the customer's own pin. */
  approximate: boolean;
  /** The zone the estimate came from, for the sentence under the map. */
  from: string | null;
}

export interface DestinationInput {
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  deliveryZone?: {
    centroidLat?: number | null;
    centroidLng?: number | null;
    zoneName?: string | null;
  } | null;
}

/** Latitude and longitude that are actually on Earth. */
function onEarth(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // 0,0 is the Gulf of Guinea and is what an unset pair looks like after a
    // bad coercion. Yaoundé is at 3.8°N 11.5°E, so a genuine fix is never this.
    !(lat === 0 && lng === 0)
  );
}

export function resolveDestination(order: DestinationInput): Destination | null {
  if (onEarth(order.deliveryLat, order.deliveryLng)) {
    return { lat: order.deliveryLat, lng: order.deliveryLng as number, approximate: false, from: null };
  }

  const zone = order.deliveryZone;
  if (zone && onEarth(zone.centroidLat, zone.centroidLng)) {
    return {
      lat: zone.centroidLat,
      lng: zone.centroidLng as number,
      approximate: true,
      from: zone.zoneName ?? null,
    };
  }

  return null;
}
