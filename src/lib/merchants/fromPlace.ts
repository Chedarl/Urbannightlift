import "server-only";

import type { MerchantCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { placeDetails } from "@/lib/maps/places";

/**
 * The catalogue row a customer creates by ordering from a business we found.
 *
 * ## The decision behind this
 *
 * The owner chose: a business found on the map is orderable straight away, and
 * the first order puts it in the catalogue. That is right — a customer should
 * never be told to wait while somebody makes a phone call — but it means a
 * customer's tap now writes a row that a dispatcher will read and a rider will
 * be sent to, and that needs care in three specific places.
 *
 * **The client is not believed.** Only the Place ID crosses the wire. Name,
 * address, coordinates and phone are fetched here from Places, because a
 * catalogue row assembled from browser-supplied strings is a forged claim about
 * somebody else's business waiting to happen.
 *
 * **The row never says we have a relationship.** `verified: false` because
 * nobody has confirmed anything, and `acceptingOrders: false` because we have
 * not asked them. The browse endpoints filter on both, so this row does not
 * appear on the food or pharmacy page as a partner. It is a place a rider can
 * be sent, and that is all it claims to be.
 *
 * **No phone, no row.** `Merchant.whatsappNumber` is non-null and read in
 * fifty-nine places, one of which would throw on null. The choice was to relax
 * the column across all of them or to skip creating a row when Places has no
 * number, and the second is better on its own merits: a catalogue entry nobody
 * can ring is a row a dispatcher opens at 1 AM and closes again. The order
 * still goes out — it takes the free-text path, with the pin, exactly as
 * before.
 *
 * Any failure here returns null and the order proceeds. A catalogue improvement
 * must never be able to lose somebody's dinner.
 */
export async function merchantFromPlace(
  placeId: string,
  category: MerchantCategory
): Promise<{ id: string } | null> {
  if (!placeId) return null;

  try {
    // Somebody already ordered from here. Reusing the row is the whole reason
    // `placeId` is unique: a name cannot tell two Pharmacie du Centres apart.
    const existing = await prisma.merchant.findUnique({
      where: { placeId },
      select: { id: true },
    });
    if (existing) return existing;

    const place = await placeDetails(placeId);
    if (!place) return null;

    // Google's own judgement about somebody else's business, and it is
    // sometimes wrong — but a shuttered building at 2 AM is the expensive way
    // to find that out, and this is the one moment we can decline cheaply.
    if (place.businessStatus === "CLOSED_PERMANENTLY") return null;

    const phone = place.nationalPhone?.trim();
    if (!phone) return null;

    return await prisma.merchant.create({
      data: {
        placeId: place.placeId,
        merchantName: place.name,
        category,
        // Reachable, which is the whole reason a row exists at all. The column
        // is named for WhatsApp because that is how Yaoundé is reached; a
        // landline here is still better than nothing and dispatch will dial it.
        whatsappNumber: phone,
        phone,
        address: place.formattedAddress || null,
        latitude: place.latitude,
        longitude: place.longitude,
        subcategory: place.primaryType,
        source: "places",
        /*
          Both false, and neither is a placeholder to be flipped later by
          anything but a person.

          `verified` is the rule the catalogue has always had: nothing is shown
          as ours unless a human confirmed it exists. `acceptingOrders` is a
          separate and equally honest no — we have not asked this business
          whether they want our orders, and presuming the answer is how a
          delivery company ends up misrepresenting a restaurant to its own
          customers.
        */
        verified: false,
        acceptingOrders: false,
      },
      select: { id: true },
    });
  } catch {
    // A duplicate placeId from two simultaneous first orders lands here too,
    // and the right answer is the same as for any other failure: let the order
    // through on the path it would have taken anyway.
    return null;
  }
}

/** Which catalogue a service's pickup belongs in. */
export function categoryForService(serviceType: string): MerchantCategory {
  if (serviceType === "FOOD_PICKUP") return "FOOD";
  if (serviceType === "MEDICINE_RUN") return "PHARMACY";
  if (serviceType === "GROCERY_RUN") return "GROCERY";
  return "OTHER";
}
