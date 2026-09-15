import { distanceKm } from "@/lib/orders/pricing";

/**
 * Roughly how long until the rider arrives.
 *
 * ## Why this is its own module
 *
 * It lived inside `LiveTrackMap` as a local closure, which was fine while
 * exactly one screen showed an arrival time. It is not fine now: the live order
 * strip shows one on every screen in the app, and two implementations of the
 * same estimate is how a customer ends up reading "8 min" on the banner and
 * "14 min" on the map at the same instant. One function, both callers.
 *
 * ## What it is, honestly
 *
 * A straight-line distance divided by a speed, padded, with a fixed allowance
 * for finding the door. There is no routing engine behind it and no traffic
 * data, and the copy that renders it must say "about" — an ETA that keeps
 * passing without the rider arriving is worse than no ETA at all, which is why
 * every constant here is pessimistic.
 */

/**
 * Average night speed for a motorbike in Yaoundé.
 *
 * Well below a daytime figure on purpose: the roads are empty after midnight
 * but the surfaces are not.
 */
export const NIGHT_SPEED_KMH = 18;

/** Finding the door, parking, the stairs. Deliveries are never door-to-door. */
export const HANDOVER_MINUTES = 4;

/** Straight-line under-reads real streets by roughly a third. */
const ROAD_FACTOR = 1.3;

/**
 * A GPS point older than this is not a position, it is a memory.
 *
 * Two minutes of silence on a night delivery usually means the rider's phone
 * has lost signal in a dip, and an arrival time computed from where they were
 * two minutes ago is a confident wrong answer. Better to say nothing.
 */
export const STALE_AFTER_MS = 120_000;

export interface Point {
  lat: number;
  lng: number;
}

export function isStalePosition(at: string | Date | null | undefined, now = Date.now()): boolean {
  if (!at) return true;
  const ms = typeof at === "string" ? Date.parse(at) : at.getTime();
  if (!Number.isFinite(ms)) return true;
  return now - ms > STALE_AFTER_MS;
}

/**
 * Minutes, or null when there is not enough to say.
 *
 * Null is a real answer and the screens render it as "on its way" — with no
 * rider position, no destination, or a stale fix, a number would be invented.
 * Clamped at both ends: under two minutes reads as already-here and over ninety
 * reads as broken.
 */
export function etaMinutes(rider: Point | null, destination: Point | null, stale: boolean): number | null {
  if (!rider || !destination || stale) return null;
  const km = distanceKm(rider.lat, rider.lng, destination.lat, destination.lng);
  if (!Number.isFinite(km)) return null;
  const minutes = Math.round((km / NIGHT_SPEED_KMH) * 60 * ROAD_FACTOR) + HANDOVER_MINUTES;
  return Math.max(2, Math.min(90, minutes));
}
