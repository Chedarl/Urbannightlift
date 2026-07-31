import "server-only";

import { serverKey, tilesKey } from "@/lib/maps/google";

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
  /**
   * Why we fell back, in Google's own words where they gave any.
   *
   * Four different problems — no key, a referrer-restricted key, billing off,
   * the API not enabled — used to produce one identical silent fallback, which
   * left whoever was configuring it with nothing to go on. Admin-only: the
   * public endpoint strips it.
   */
  reason?: string;
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
/** Don't hammer Google on every map mount while a key is misconfigured. */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

interface SessionAttempt {
  token: string | null;
  /** Google's own words when it refused, for the admin readout. */
  error: string | null;
}

let cached: { token: string; expires: number; language: string } | null = null;
let lastFailure: { at: number; error: string } | null = null;
let inFlight: Promise<SessionAttempt> | null = null;

async function createSession(language: string): Promise<SessionAttempt> {
  // The **server** key, not the tiles key. This POST comes from our server and
  // carries no referrer, so a referrer-restricted key is rejected — which is
  // precisely the misconfiguration that used to fail silently.
  const key = serverKey() ?? tilesKey();
  if (!key) return { token: null, error: "No Google Maps key is configured." };

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
    });

    if (!res.ok) {
      // Google's message is the whole value here: it distinguishes a referrer
      // restriction from billing being off from the API not being enabled, and
      // those need three completely different fixes.
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string; status?: string } }
        | null;
      return {
        token: null,
        error: body?.error?.message ?? `Google refused the session (HTTP ${res.status}).`,
      };
    }

    const data = (await res.json()) as { session?: string };
    return data.session
      ? { token: data.session, error: null }
      : { token: null, error: "Google returned no session token." };
  } catch (err) {
    return { token: null, error: `Couldn't reach Google: ${(err as Error).message}` };
  }
}

/**
 * The tile URL template Leaflet should use, or the CARTO fallback.
 *
 * `{z}/{x}/{y}` are left for Leaflet to substitute. The key in the query string
 * is the **tiles** key, because the browser fetches these directly — that is
 * the one that may be referrer-restricted.
 *
 * Always returns a usable map. `reason` explains a fallback for whoever is
 * configuring this; it is stripped before the public endpoint answers.
 */
export async function tileConfig(fr: boolean): Promise<TileConfig> {
  const browserKey = tilesKey() ?? serverKey();
  if (!browserKey) {
    return { ...CARTO_FALLBACK, reason: "No Google Maps key is configured." };
  }

  const language = fr ? "fr-FR" : "en-GB";
  const now = Date.now();
  if (cached && cached.expires > now && cached.language === language) {
    return googleConfig(cached.token, browserKey);
  }

  // A rejected key stays rejected until someone changes it, so retrying on
  // every single map mount would turn one mistake into thousands of calls.
  if (lastFailure && now - lastFailure.at < RETRY_AFTER_FAILURE_MS) {
    return { ...CARTO_FALLBACK, reason: lastFailure.error };
  }

  // One createSession at a time, however many maps mount at once.
  inFlight ??= createSession(language).finally(() => {
    inFlight = null;
  });
  const attempt = await inFlight;

  if (!attempt.token) {
    lastFailure = { at: now, error: attempt.error ?? "Unknown error." };
    return { ...CARTO_FALLBACK, reason: lastFailure.error };
  }

  lastFailure = null;
  cached = { token: attempt.token, expires: now + SESSION_TTL_MS, language };
  return googleConfig(attempt.token, browserKey);
}

function googleConfig(session: string, key: string): TileConfig {
  return {
    url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`,
    // Required by the Map Tiles policy, and it must not be obscured.
    attribution: "&copy; Google",
    google: true,
  };
}
