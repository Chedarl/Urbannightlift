import "server-only";

/**
 * Google Maps, used for the two things OpenStreetMap cannot do here.
 *
 * Yaoundé on OSM is thin. The catalogue we seeded and the places we have
 * actually delivered to are better than anything a third party knows, but past
 * those the app fell back to Nominatim — and a customer typing a real street
 * would get nothing. Google knows the streets and the businesses in this city;
 * that data, not the rendering, is the reason to pay for it.
 *
 * ## What this costs (Google's per-SKU monthly free tier)
 *  - **Autocomplete, per session: free and unlimited.** Typing costs nothing;
 *    the session is closed by one Place Details call when somebody picks.
 *  - **Place Details (Essentials): 10,000/month free**, then $5/1,000. Two
 *    addresses per order means ~1,800/month at 900 orders.
 *  - **Geocoding: 10,000/month free**, then $5/1,000 — one call per free-text
 *    order, and only when the catalogue missed.
 *  - **Map Tiles (2D): 100,000 tiles/month free**, then $0.60/1,000.
 *
 * The expensive SKU is Dynamic Maps — the Maps JavaScript API — at $7 per 1,000
 * *map loads*. We deliberately do not use it: Leaflet stays the renderer and we
 * buy tiles, which Google's Map Tiles policy explicitly provides for.
 *
 * ## Two keys, on purpose
 * Tiles are fetched by the browser, so a tile key is necessarily public — the
 * same as the key in any Google-powered site's page source. It must therefore be
 * **restricted to the Map Tiles API and to our own domain** in the Cloud console,
 * which is the mitigation Google designs for. Places and Geocoding are called
 * only from here and use a second, server-held key that is never sent to a
 * browser. One key in both variables works, but leaves the search quota
 * spendable by anyone who reads the page.
 *
 * Every function returns null instead of throwing. A geocode we could not do is
 * a missing pin; it must never be a customer who cannot place an order.
 */

/** Public, browser-visible, restricted to the Map Tiles API + our domain. */
export function tilesKey(): string | null {
  return process.env.GOOGLE_MAPS_TILES_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
}

/** Server-only. Places + Geocoding. Never sent to a client. */
function serverKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
}

export function hasGooglePlaces(): boolean {
  return Boolean(serverKey());
}

/** Yaoundé, generously bounded. Keeps a same-named place elsewhere out. */
const YAOUNDE_BOUNDS = { low: { latitude: 3.75, longitude: 11.35 }, high: { latitude: 4.02, longitude: 11.65 } };
const TIMEOUT_MS = 3500;

async function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- autocomplete

export interface PlacePrediction {
  placeId: string;
  /** What to show in the list — the shop or street on its own. */
  primary: string;
  /** The area under it. */
  secondary: string;
}

/**
 * Suggestions as somebody types, restricted to Cameroon and biased to Yaoundé.
 *
 * `sessionToken` is what makes this free: every keystroke inside one session is
 * billed as part of the single Place Details call that closes it. Callers must
 * pass the same token for a whole typing session and a fresh one afterwards.
 */
export async function placeAutocomplete(
  input: string,
  sessionToken: string,
  fr: boolean
): Promise<PlacePrediction[]> {
  const key = serverKey();
  if (!key || input.trim().length < 2) return [];

  const data = await postJson<{
    suggestions?: {
      placePrediction?: {
        placeId: string;
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        text?: { text: string };
      };
    }[];
  }>(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      input,
      sessionToken,
      includedRegionCodes: ["cm"],
      languageCode: fr ? "fr" : "en",
      locationBias: { rectangle: YAOUNDE_BOUNDS },
    },
    { "X-Goog-Api-Key": key }
  );

  return (data?.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((p) => p.primary.length > 0);
}

// -------------------------------------------------------------- place details

export interface PlacePoint {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  displayName: string;
}

/**
 * Coordinates for a prediction the customer picked.
 *
 * Only `location`, `formattedAddress` and `displayName` are requested, which
 * keeps this in the **Essentials** field tier — the cheap one. Asking for more
 * than we render would quietly move every call into a tier costing three times
 * as much.
 */
export async function placeDetails(placeId: string, sessionToken: string): Promise<PlacePoint | null> {
  const key = serverKey();
  if (!key || !placeId) return null;

  const data = await getJson<{
    location?: { latitude: number; longitude: number };
    formattedAddress?: string;
    displayName?: { text: string };
  }>(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    "X-Goog-Api-Key": key,
    "X-Goog-FieldMask": "location,formattedAddress,displayName",
  });

  const lat = data?.location?.latitude;
  const lng = data?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: data?.formattedAddress ?? "",
    displayName: data?.displayName?.text ?? data?.formattedAddress ?? "",
  };
}

// ------------------------------------------------------------------ geocoding

/**
 * Free text to a point, bounded to Yaoundé.
 *
 * Used only after the customer's own delivered places and the seeded catalogue
 * have both missed — those are better sources and stay ahead of this.
 */
export async function geocodeText(text: string, fr: boolean): Promise<PlacePoint | null> {
  const key = serverKey();
  if (!key || text.trim().length < 3) return null;

  const params = new URLSearchParams({
    address: `${text}, Yaoundé, Cameroun`,
    region: "cm",
    language: fr ? "fr" : "en",
    bounds: `${YAOUNDE_BOUNDS.low.latitude},${YAOUNDE_BOUNDS.low.longitude}|${YAOUNDE_BOUNDS.high.latitude},${YAOUNDE_BOUNDS.high.longitude}`,
    key,
  });

  const data = await getJson<{
    status: string;
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
  }>(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);

  if (data?.status !== "OK") return null;
  const hit = data.results?.[0];
  if (!hit) return null;

  const { lat, lng } = hit.geometry.location;
  // Google will happily answer with a point outside the bounds when it finds
  // nothing inside them, so the bound is enforced here rather than trusted.
  if (
    lat < YAOUNDE_BOUNDS.low.latitude ||
    lat > YAOUNDE_BOUNDS.high.latitude ||
    lng < YAOUNDE_BOUNDS.low.longitude ||
    lng > YAOUNDE_BOUNDS.high.longitude
  ) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: hit.formatted_address,
    displayName: hit.formatted_address.split(",").slice(0, 2).join(",").trim(),
  };
}
