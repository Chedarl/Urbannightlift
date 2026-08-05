/**
 * When a business is complete enough to save.
 *
 * ## The bug this exists to end
 *
 * `POST /api/merchants` required a **street address**, and `Merchant.address`
 * was a NOT NULL column. The capture panel mirrored the rule in its own list of
 * required fields. So the owner would photograph a restaurant's Instagram page,
 * watch the name, the phone number, the quartier and the opening hours come
 * back correctly — and then find the Save button dead, with nothing on screen
 * saying why.
 *
 * That rule was wrong, and wrong in a way this product should have caught
 * sooner: **Yaoundé does not use street addresses.** The whole address stack
 * exists because of it — `resolveAddress` ranks places we have delivered to
 * above any geocoder, `VerifiedPlace` accumulates real GPS from completed
 * deliveries, and the order forms ask for a landmark rather than a line. The
 * catalogue was demanding the one field a social media page can never truthfully
 * supply, in a city where the field mostly does not exist.
 *
 * ## The rule now
 *
 * A merchant needs a **name**, a **category**, a **WhatsApp number**, and *some*
 * way to be found — any one of a quartier, a dropped pin, or an address. A rider
 * can be sent to "Chez Maman Josephine, Biyem-Assi" and cannot be sent to a
 * business with no location at all, and that is the actual line.
 *
 * ## Why it is a module and not two `if`s
 *
 * The endpoint and the panel each had their own copy of the requirement, which
 * is how a disabled button and a 400 response ended up meaning different things.
 * Both call this now, so what the button says is missing is exactly what the
 * server would refuse — and `scripts/verify-merchant-complete.ts` proves it
 * against the shapes the capture actually produces.
 *
 * Pure: no Prisma, no network, so it runs in the browser and in the route.
 */

export interface MerchantDraftish {
  merchantName?: string | null;
  category?: string | null;
  whatsappNumber?: string | null;
  phone?: string | null;
  neighbourhood?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** The field names a caller can highlight, in the order they appear on a form. */
export type MissingField = "merchantName" | "category" | "whatsappNumber" | "where";

const CATEGORIES = new Set(["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"]);

/** A Cameroonian number is nine digits; anything shorter reaches nobody. */
function usablePhone(raw: string | null | undefined): boolean {
  return (raw ?? "").replace(/\D/g, "").length >= 9;
}

/**
 * Somewhere a rider could actually be sent.
 *
 * A pin is best, a quartier is enough, and a written address is fine when there
 * is one — but at least one of the three has to be true.
 */
export function hasSomewhere(draft: MerchantDraftish): boolean {
  if ((draft.neighbourhood ?? "").trim().length >= 2) return true;
  if ((draft.address ?? "").trim().length >= 3) return true;
  return (
    typeof draft.latitude === "number" &&
    typeof draft.longitude === "number" &&
    Number.isFinite(draft.latitude) &&
    Number.isFinite(draft.longitude)
  );
}

/** What is still missing, in form order. Empty means it can be saved. */
export function missingForMerchant(draft: MerchantDraftish): MissingField[] {
  const missing: MissingField[] = [];
  if ((draft.merchantName ?? "").trim().length < 2) missing.push("merchantName");
  if (!CATEGORIES.has((draft.category ?? "").toUpperCase())) missing.push("category");
  // WhatsApp is how every merchant conversation in this product happens — the
  // ping, the verification call, the invite. A merchant we cannot message is a
  // row nobody will ever confirm.
  if (!usablePhone(draft.whatsappNumber) && !usablePhone(draft.phone)) missing.push("whatsappNumber");
  if (!hasSomewhere(draft)) missing.push("where");
  return missing;
}

export function isSaveableMerchant(draft: MerchantDraftish): boolean {
  return missingForMerchant(draft).length === 0;
}

/** The same list as a sentence, for the panel and for the endpoint's 400. */
export function describeMissing(missing: MissingField[], fr = false): string {
  if (missing.length === 0) return "";
  const words: Record<MissingField, { en: string; fr: string }> = {
    merchantName: { en: "a name", fr: "un nom" },
    category: { en: "a category", fr: "une catégorie" },
    whatsappNumber: { en: "a WhatsApp number", fr: "un numéro WhatsApp" },
    where: {
      en: "somewhere to find them — a quartier, a pin, or an address",
      fr: "où les trouver — un quartier, un point sur la carte, ou une adresse",
    },
  };
  const list = missing.map((m) => (fr ? words[m].fr : words[m].en));
  const last = list.pop()!;
  return list.length === 0 ? `Still needs ${last}.` : `Still needs ${list.join(", ")} and ${last}.`;
}
