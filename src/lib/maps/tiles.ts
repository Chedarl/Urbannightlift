import "server-only";

import { tilesKey } from "@/lib/maps/google";

/**
 * Google's basemap, in our night palette, drawn by Leaflet.
 *
 * We buy **tiles**, not the Maps JavaScript API. Dynamic Maps bills $7 per
 * 1,000 map loads; 2D tiles give 100,000 free a month and then $0.60 per 1,000,
 * and Google's Map Tiles policy explicitly covers using them "to display Google
 * Maps using a third-party renderer" — provided their attribution shows and
 * nothing covers their logo, which `TileAttribution` handles.
 *
 * A tile session is a POST that returns a token good for about two weeks. It is
 * cached in module memory so a busy night is one createSession call per server
 * instance, not one per map.
 *
 * **Everything degrades to CARTO.** No key, a failed session, a Google outage —
 * the map still draws on the free OpenStreetMap-derived tiles it used before.
 * A slightly plainer map is a nuisance; a blank one is a customer who thinks
 * their delivery has vanished.
 */

export const CARTO_FALLBACK = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  google: false as const,
};

export interface TileConfig {
  url: string;
  attribution: string;
  google: boolean;
}

/**
 * The night palette, as Map Tiles style rules.
 *
 * Google's roadmap is a daylight map and would look like a different product
 * dropped into ours. This is the same treatment CARTO's `dark_all` gives, tuned
 * to the ink/violet/gold system: dark ground, lighter roads so a rider's route
 * still reads, and points of interest turned down so the markers stay loudest.
 * `styles` is only valid on `roadmap`, which is what we ask for.
 */
const NIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#12101a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8e8aa0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0710" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#161d18" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#232030" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9a95ad" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#2b2740" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3157" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1622" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a2640" }] },
];

const SESSION_TTL_MS = 10 * 24 * 60 * 60 * 1000; // Google says ~2 weeks; renew early.

let cached: { token: string; expires: number; language: string } | null = null;
let inFlight: Promise<string | null> | null = null;

async function createSession(language: string): Promise<string | null> {
  const key = tilesKey();
  if (!key) return null;
  try {
    const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: "roadmap",
        language,
        region: "CM",
        highDpi: true,
        scale: "scaleFactor2x",
        styles: NIGHT_STYLE,
      }),
      // A tile session is not per-request state; let Next cache the fetch too.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: string };
    return data.session ?? null;
  } catch {
    return null;
  }
}

/**
 * The tile URL template Leaflet should use, or the CARTO fallback.
 *
 * `{z}/{x}/{y}` are left for Leaflet to substitute. The key rides in the query
 * string because the browser fetches these directly — see the note in
 * `google.ts` about why that key must be referrer-restricted.
 */
export async function tileConfig(fr: boolean): Promise<TileConfig> {
  const key = tilesKey();
  if (!key) return CARTO_FALLBACK;

  const language = fr ? "fr-FR" : "en-GB";
  const now = Date.now();
  if (cached && cached.expires > now && cached.language === language) {
    return googleConfig(cached.token, key);
  }

  // One createSession at a time, however many maps mount at once.
  inFlight ??= createSession(language).finally(() => {
    inFlight = null;
  });
  const token = await inFlight;
  if (!token) return CARTO_FALLBACK;

  cached = { token, expires: now + SESSION_TTL_MS, language };
  return googleConfig(token, key);
}

function googleConfig(session: string, key: string): TileConfig {
  return {
    url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`,
    // Required by the Map Tiles policy, and it must not be obscured.
    attribution: "&copy; Google",
    google: true,
  };
}
