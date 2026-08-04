import "server-only";

import { serverKey, tilesKey } from "@/lib/maps/google";
import { checkMaptilerStyle, clearMaptilerCheck, maptilerConfig } from "@/lib/maps/maptiler";

/**
 * Which basemap the whole product draws, and why.
 *
 * Three providers, tried in order, each falling through to the next:
 *
 *  1. **MapTiler** — signs up with no billing details, 100,000 tiles a month
 *     free, and takes a style so the map wears this product's night palette.
 *     Preferred because Google Cloud billing rejects most Cameroonian cards,
 *     which puts Google out of reach indefinitely rather than temporarily.
 *  2. **Google** — the best data, kept wired and one environment variable away
 *     should a card ever work. We buy *tiles*, never the Maps JavaScript API:
 *     Dynamic Maps bills $7 per 1,000 map loads against $0.60 for tiles, and
 *     Google's Map Tiles policy explicitly covers a third-party renderer so long
 *     as their attribution shows.
 *  3. **CARTO** — free, keyless, and what the site has always run on.
 *
 * Google needs a session token minted by a server-side POST, cached here for
 * days so a busy night is one call per instance rather than one per map.
 * MapTiler needs nothing of the kind, which is also why it cannot repeat the
 * referrer mistake that left the maps silently on CARTO for a day.
 *
 * **Everything degrades.** No key, a failed session, an outage — the map still
 * draws. A plainer map is a nuisance; a blank one is a customer who thinks
 * their delivery has vanished.
 */

export type TileProvider = "maptiler" | "google" | "carto";

export const CARTO_FALLBACK = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  provider: "carto" as const,
};

export interface TileConfig {
  url: string;
  attribution: string;
  provider: TileProvider;
  /**
   * The same ground seen from above, where the provider has it.
   *
   * Public, unlike `reason` — it is a tile URL like the one beside it, and the
   * customer picking their gate is exactly who needs it. Absent on CARTO and on
   * Google, so every consumer must treat it as optional.
   */
  satelliteUrl?: string;
  /**
   * Why we are not on the provider we would prefer, in the provider's own words
   * where they gave any.
   *
   * Several different problems — no key, a referrer-restricted key, billing
   * off, an API not enabled — used to produce one identical silent fallback,
   * which left whoever was configuring it with nothing to go on. Admin-only:
   * the public endpoint strips it.
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

/**
 * Forget a previous rejection and try Google again on the next call.
 *
 * Backs the "Re-check" button on the admin readout. Somebody who has just
 * enabled billing or removed a key restriction should be able to see the result
 * immediately, rather than being told it is still broken for another five
 * minutes — which is exactly the moment they would conclude the fix had not
 * worked and undo it.
 */
export function clearTileFailureMemo(): void {
  lastFailure = null;
  clearMaptilerCheck();
}

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
  // MapTiler first: no card, no session call, and nothing about it can fail
  // silently in the way Google's referrer restriction did.
  //
  // A key alone is not proof of a working map — a wrong style id 404s every
  // tile and looks identical from here — so the style is verified with the
  // provider before we claim it. `checkMaptilerStyle` deliberately errs towards
  // *keeping* MapTiler when the answer is ambiguous.
  const maptiler = maptilerConfig();
  let maptilerReason: string | null = null;
  if (maptiler) {
    const check = await checkMaptilerStyle();
    if (check.ok) return { ...maptiler, provider: "maptiler", reason: check.note };
    maptilerReason = check.reason;
  }

  const browserKey = tilesKey() ?? serverKey();
  if (!browserKey) {
    return {
      ...CARTO_FALLBACK,
      reason:
        maptilerReason ?? "No MAPTILER_KEY and no Google Maps key are configured.",
    };
  }

  const language = fr ? "fr-FR" : "en-GB";
  const now = Date.now();
  if (cached && cached.expires > now && cached.language === language) {
    return googleConfig(cached.token, browserKey);
  }

  // A rejected key stays rejected until someone changes it, so retrying on
  // every single map mount would turn one mistake into thousands of calls.
  if (lastFailure && now - lastFailure.at < RETRY_AFTER_FAILURE_MS) {
    return { ...CARTO_FALLBACK, reason: both(maptilerReason, lastFailure.error) };
  }

  // One createSession at a time, however many maps mount at once.
  inFlight ??= createSession(language).finally(() => {
    inFlight = null;
  });
  const attempt = await inFlight;

  if (!attempt.token) {
    lastFailure = { at: now, error: attempt.error ?? "Unknown error." };
    return { ...CARTO_FALLBACK, reason: both(maptilerReason, lastFailure.error) };
  }

  lastFailure = null;
  cached = { token: attempt.token, expires: now + SESSION_TTL_MS, language };
  return googleConfig(attempt.token, browserKey);
}

/**
 * Both reasons, when both providers had something to say.
 *
 * If MapTiler was misconfigured *and* Google refused, hearing only about Google
 * sends whoever is fixing this to the wrong console — and MapTiler is the one
 * they can actually fix, so it goes first.
 */
function both(maptiler: string | null, google: string): string {
  return maptiler ? `${maptiler} Google was tried next: ${google}` : google;
}

function googleConfig(session: string, key: string): TileConfig {
  return {
    url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`,
    // Required by the Map Tiles policy, and it must not be obscured.
    attribution: "&copy; Google",
    provider: "google",
  };
}
