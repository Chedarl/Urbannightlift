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

/**
 * How old a position is, as a shape the copy can be built from.
 *
 * ## The bug this exists to kill
 *
 * Both screens that show a freshness label built it the same way: a helper
 * returning a *string*, where the first branch returned a complete phrase
 * ("just now") and the other two returned bare durations ("16s", "2 min").
 * The caller then dropped whatever came back into a frame built for a duration:
 *
 *     "updated {time} ago"   →  "updated just now ago"
 *     "last sent {time} ago" →  "last sent just now ago · 12 updates"
 *
 * On the rider's own screen that was not an edge case, it was the normal
 * reading — location is shared every few seconds, so the rider who is doing the
 * thing correctly is the one being shown broken English. It survived because
 * "just now" is a perfectly good string and nothing about the type said it
 * could not be substituted into a sentence.
 *
 * So this returns the *category*, not the words. A phrase and a duration are
 * different kinds of thing and now have different shapes, which means the
 * grammar is decided at the call site — where the surrounding sentence is —
 * and a frame that only fits a duration cannot be handed a phrase.
 */
export type Freshness =
  | { kind: "unknown" }
  /** Recent enough that any number would be noise. Needs its own sentence. */
  | { kind: "now" }
  | { kind: "seconds"; n: number }
  | { kind: "minutes"; n: number };

/** Under this, a position is "just now" rather than a count. */
export const JUST_NOW_MS = 10_000;

export function freshness(ageMs: number | null | undefined): Freshness {
  if (ageMs == null || !Number.isFinite(ageMs)) return { kind: "unknown" };
  const sec = Math.max(0, Math.round(ageMs / 1000));
  if (sec * 1000 < JUST_NOW_MS) return { kind: "now" };
  if (sec < 60) return { kind: "seconds", n: sec };
  return { kind: "minutes", n: Math.max(1, Math.round(sec / 60)) };
}
