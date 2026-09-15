/**
 * Places text search — business discovery, deliberately outside `server-only`.
 *
 * ## Why this is not in `google.ts`
 *
 * `google.ts` starts with `import "server-only"`, whose whole job is to throw
 * when imported outside a React Server Component. That is right for the request
 * path, and wrong here: the only caller is `scripts/gather-merchants.ts`, a CLI
 * run under `tsx`, which is legitimately server code the package cannot tell
 * apart from a browser bundle. `verify-all.mts` works around the same thing by
 * stubbing the package for its run; repeating that hack per script is worse
 * than putting the code where it does not need it. Same split, same reasoning,
 * as `calls/ice.ts` and `calls/iceServers.ts`.
 *
 * Dropping the guard is safe because there is nothing here to leak: the key is
 * read from a non-`NEXT_PUBLIC_` variable, so in a browser bundle it resolves
 * to `undefined` and every function returns empty rather than calling anything.
 */

/** Yaoundé, generously bounded. Keeps a same-named place elsewhere out. */
const YAOUNDE_BOUNDS = {
  low: { latitude: 3.75, longitude: 11.35 },
  high: { latitude: 4.02, longitude: 11.65 },
};

/** Longer than the request path's 3.5s: a batch run can afford to wait. */
const TIMEOUT_MS = 10_000;

function serverKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
}

export function hasPlacesKey(): boolean {
  return Boolean(serverKey());
}

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

/**
 * One business found by searching, with only the facts we are licensed to keep.
 *
 * Nothing here is creative work. Names, addresses, coordinates, opening hours
 * and phone numbers are facts about a business, and Places is the licensed way
 * to obtain them.
 *
 * **Photos are deliberately absent**, and their absence is a decision rather
 * than an omission. Places photos carry attribution and caching conditions that
 * a seeded JSON file cannot honour, and a restaurant's logo is its trademark —
 * putting one on our order page implies a relationship we do not have. The
 * licit route to a merchant's logo is the merchant uploading it, which
 * `Merchant.logoUrl` and the existing onboarding already do.
 */
export interface PlaceBusiness {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  /** Google's own type, e.g. `restaurant`, `pharmacy`. For triage, not display. */
  primaryType: string | null;
  nationalPhone: string | null;
  /** `OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`. */
  businessStatus: string | null;
  /** Human-readable weekly hours, as Google returns them. */
  openingHours: string[] | null;
}

/**
 * Businesses matching a query, inside Yaoundé.
 *
 * ## The field mask is the cost control, and it is not optional
 *
 * Places (New) bills by SKU according to which fields you ask for: ids and
 * addresses are the cheap tier, opening hours and phone numbers the next, and
 * photos the most expensive. Asking for `*` is how a catalogue run becomes an
 * unpleasant invoice. The mask here is the smallest set that produces a useful
 * merchant row, and it deliberately omits photos — see `PlaceBusiness`.
 *
 * Returns `[]` rather than throwing on any failure, matching the rest of the
 * maps code: a gatherer that dies halfway leaves a half-written file.
 */
export async function searchBusinesses(query: string, maxResults = 20): Promise<PlaceBusiness[]> {
  const key = serverKey();
  if (!key) return [];

  const data = await postJson<{
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      primaryType?: string;
      nationalPhoneNumber?: string;
      businessStatus?: string;
      regularOpeningHours?: { weekdayDescriptions?: string[] };
    }[];
  }>(
    "https://places.googleapis.com/v1/places:searchText",
    {
      textQuery: query,
      includedRegionCodes: ["cm"],
      maxResultCount: Math.min(20, Math.max(1, maxResults)),
      locationRestriction: { rectangle: YAOUNDE_BOUNDS },
    },
    {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.primaryType",
        "places.nationalPhoneNumber",
        "places.businessStatus",
        "places.regularOpeningHours.weekdayDescriptions",
      ].join(","),
    }
  );

  return (data?.places ?? [])
    .filter((p) => p.id && p.displayName?.text && p.location)
    .map((p) => ({
      placeId: p.id,
      name: p.displayName!.text!,
      formattedAddress: p.formattedAddress ?? "",
      latitude: p.location!.latitude,
      longitude: p.location!.longitude,
      primaryType: p.primaryType ?? null,
      nationalPhone: p.nationalPhoneNumber ?? null,
      businessStatus: p.businessStatus ?? null,
      openingHours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    }))
    /*
      Enforced here rather than trusted. `locationRestriction` is respected in
      practice, but `geocodeText` in `google.ts` documents Google answering
      outside its bounds when it finds nothing inside them, and a Douala
      pharmacy in a Yaoundé catalogue is worse than a short catalogue.
    */
    .filter(
      (p) =>
        p.latitude >= YAOUNDE_BOUNDS.low.latitude &&
        p.latitude <= YAOUNDE_BOUNDS.high.latitude &&
        p.longitude >= YAOUNDE_BOUNDS.low.longitude &&
        p.longitude <= YAOUNDE_BOUNDS.high.longitude
    );
}
