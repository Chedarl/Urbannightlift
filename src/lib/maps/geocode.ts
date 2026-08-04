import "server-only";

import { maptilerKey } from "@/lib/maps/maptiler";

/**
 * Geocoding on the key we are already paying nothing for.
 *
 * The address chain's last resort is Nominatim, and Nominatim is the weakest
 * link in the whole stack: OpenStreetMap's Yaoundé coverage is thin, its rate
 * limit is one request a second with a user-agent policy attached, and its
 * answers are good enough to be stored and not good enough to be trusted.
 *
 * MapTiler's geocoding is on the **same free plan as the tiles this product
 * already draws** — 100,000 requests a month, the key already in Vercel, no
 * card. That last part is not a detail: Google is out of reach indefinitely
 * because Cameroonian cards keep being rejected, which is why the basemap moved
 * here in the first place.
 *
 * ## Where it sits, and why not higher
 *
 * Below the address book, below the catalogue, below the model. Somewhere we
 * have actually delivered beats any geocoder, and no geocoder on earth resolves
 * "behind the Total station at Rond-Point Express, blue gate". This is the step
 * that turns *"Carrefour Warda"* into a point — not the step that understands a
 * Yaoundé address.
 *
 * Confidence is capped accordingly, so a dispatcher can still question it.
 */

const TIMEOUT_MS = 3500;

/** Yaoundé, generously. Keeps a same-named place elsewhere out of the answer. */
const BBOX = "11.35,3.75,11.65,4.02";
const PROXIMITY = "11.5021,3.8480";

export interface GeocodeHit {
  latitude: number;
  longitude: number;
  displayName: string;
  /** MapTiler's own 0–1 relevance, passed through rather than reinvented. */
  relevance: number;
}

interface Feature {
  place_name?: string;
  text?: string;
  relevance?: number;
  center?: [number, number];
}

export function geocodingConfigured(): boolean {
  return Boolean(maptilerKey());
}

/**
 * One place, or null.
 *
 * Null covers no key, no match, a timeout and a rejection identically, because
 * every caller does the same thing with all four: falls through to the next
 * step. Nothing in this product may fail because a geocoder did.
 */
export async function geocodeMapTiler(text: string): Promise<GeocodeHit | null> {
  const key = maptilerKey();
  const query = text.trim();
  if (!key || query.length < 3) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url =
      `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json` +
      `?key=${encodeURIComponent(key)}&country=cm&bbox=${BBOX}&proximity=${PROXIMITY}` +
      `&limit=1&language=fr`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as { features?: Feature[] };
    const hit = data.features?.[0];
    // MapTiler returns [lng, lat] — GeoJSON order, and the wrong way round from
    // every other coordinate in this codebase. Reversing it here once is safer
    // than trusting each caller to remember.
    const lng = hit?.center?.[0];
    const lat = hit?.center?.[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      latitude: lat as number,
      longitude: lng as number,
      displayName: (hit?.place_name || hit?.text || query).split(",").slice(0, 2).join(",").trim(),
      relevance: typeof hit?.relevance === "number" ? hit.relevance : 0.5,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
