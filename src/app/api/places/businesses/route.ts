import { NextRequest, NextResponse } from "next/server";
import type { MerchantCategory } from "@prisma/client";

import { searchNearby, searchBusinesses, hasPlacesKey, type PlaceBusiness } from "@/lib/maps/places";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/places/businesses — the one door onto business discovery.
 *
 * ## What this is for
 *
 * Until now a customer could only reach a business somebody had already typed
 * into `Merchant`. That is why the food and pharmacy pages are correct and
 * empty: the catalogue rule — nothing appears unless a human confirmed the
 * business exists — is right, and it means the shelf stays bare until the
 * calling is done. Text search existed in `lib/maps/places.ts` but was reachable
 * only from a CLI script, so no screen could use it.
 *
 * This route opens that to the request path, and it is deliberately the *only*
 * way in. One door is one place to rate-limit, one field mask to audit, and one
 * place a `places.photos` would have to get past.
 *
 * ## What comes back, and what a caller may do with it
 *
 * `PlaceBusiness` — name, address, coordinates, phone, hours, status. Facts
 * about a business, which Places is the licensed way to obtain. **No photos, no
 * ratings, no reviews, no editorial summaries**, because those are somebody
 * else's work and this product has already shipped invented restaurant data
 * once and had to take it straight back out.
 *
 * A result here is **not a partner**. Nothing may render it as verified, and
 * nothing may show it a menu, because we have neither. What it is good for is
 * sending a rider somewhere real, which is the whole of the free-text ordering
 * path with a search in front of it instead of a blank box.
 */

/**
 * Our categories in Google's vocabulary.
 *
 * Mapped here rather than inside the Places module because this is the layer
 * that knows what the customer asked for. A pharmacy search has to include
 * `drugstore` — in Yaoundé the distinction Google draws between the two does
 * not survive contact with the street, and missing half the pharmacies at 2 AM
 * is the exact moment this product exists for.
 *
 * `OTHER` maps to no types at all, which means every type: a parcel pickup is
 * "the electronics shop by the junction" and belongs to no category we would
 * think to list.
 */
const PLACE_TYPES = {
  FOOD: ["restaurant", "meal_takeaway", "meal_delivery", "bakery", "cafe"],
  PHARMACY: ["pharmacy", "drugstore"],
  GROCERY: ["supermarket", "grocery_store", "convenience_store"],
  GENERAL_STORE: ["convenience_store", "department_store", "store"],
  OTHER: [],
} satisfies Record<MerchantCategory, string[]>;

export interface DiscoveredBusinessesResponse {
  businesses: PlaceBusiness[];
  /**
   * Why the list is empty, when it is — so a screen can say the right thing.
   *
   * `no-key` is the state this runs in until the owner creates a Maps key, and
   * it is not an error: the screens fall back to our own catalogue and say so.
   * Telling them apart matters, because "nothing is open near you" and "we
   * cannot look right now" are different sentences.
   */
  source: "places" | "no-key" | "rate-limited";
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const query = (sp.get("q") ?? "").trim();
  const category = (sp.get("category") ?? "OTHER").toUpperCase();

  const types = PLACE_TYPES[category as MerchantCategory] ?? PLACE_TYPES.OTHER;

  /*
   * Rate-limited from the first commit, unlike the two location routes beside
   * it, which went a year uncapped because a proxy does not look like a form.
   * Counted as address typing, because that is what it is: one debounced
   * keystroke at a time, against somebody else's billed service.
   */
  if (!(await checkRateLimit(req, "placesSearch")).ok) {
    return NextResponse.json({ businesses: [], source: "rate-limited" } satisfies DiscoveredBusinessesResponse);
  }

  if (!hasPlacesKey()) {
    return NextResponse.json({ businesses: [], source: "no-key" } satisfies DiscoveredBusinessesResponse);
  }

  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

  /*
   * A typed query is a text search; a bare point is a nearby search.
   *
   * Two different questions — "where is Tchop et Yamo" and "what is near me" —
   * and answering the first with a radius around a pin is how somebody
   * searching by name is told their restaurant does not exist because it is
   * three kilometres away.
   */
  const businesses = query
    ? await searchBusinesses(query)
    : hasPoint
      ? await searchNearby(lat, lng, types, radiusOf(sp.get("radius")))
      : [];

  return NextResponse.json({
    /*
      A permanently closed business is filtered out here rather than shown
      greyed. "Closed permanently" is Google's judgement about somebody else's
      business and it is sometimes wrong, but sending a rider to a shuttered
      building at 2 AM is the more expensive way to find out.
    */
    businesses: businesses.filter((b) => b.businessStatus !== "CLOSED_PERMANENTLY"),
    source: "places",
  } satisfies DiscoveredBusinessesResponse);
}

function radiusOf(raw: string | null): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
