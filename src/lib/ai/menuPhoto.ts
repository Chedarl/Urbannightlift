import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { readImage } from "@/lib/ai/images";
import { got, none, type AiRead } from "@/lib/ai/result";

/**
 * Turning a photograph of a menu board into rows somebody can tick.
 *
 * This is the answer to the question the food page could not solve on its own.
 * The browsing grid is honest now — nothing appears unless a human confirmed
 * the business exists — which means it is also **empty**, and will stay empty
 * for as long as filling it means typing forty dishes and prices by hand.
 *
 * Every other route to filling it has already been tried and rejected here, for
 * reasons that have not changed:
 *
 *  - **A map database.** 959 businesses imported from OpenStreetMap, mostly
 *    defunct when the owner checked them, deleted in v12.
 *  - **Google Places.** Their terms forbid storing the content, and the account
 *    is unreachable anyway because the card is refused.
 *  - **Inventing it.** Three fabricated restaurants shipped to customers and
 *    were removed in the same change that added this file.
 *
 * What is left is the merchant's own price list, photographed with their
 * knowledge. It is current, it is theirs, it comes with consent, and a phone
 * camera is the only equipment involved.
 *
 * **Nothing here saves anything.** It returns a draft. An admin ticks the rows
 * that are right and fixes the ones that are not, exactly as the
 * website-scraping draft already works — because a price published to customers
 * from an unreviewed photograph is how the catalogue starts lying again.
 */

export interface DraftItem {
  name: string;
  nameFr: string | null;
  priceXaf: number | null;
  unit: string | null;
  /** BEIGNETS, POULET, GRILLADES… what makes a grid browsable rather than a list. */
  category: string | null;
  /** One short appetising line, so the grid reads like a menu and not a stock list. */
  description: string | null;
}

interface Answer {
  readable?: boolean;
  items?: {
    name?: string;
    nameFr?: string | null;
    priceXaf?: number | null;
    unit?: string | null;
    category?: string | null;
    description?: string | null;
  }[];
}

const SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    readable: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          nameFr: { type: "string" },
          priceXaf: { type: "number" },
          unit: { type: "string" },
          category: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You read menus and price lists from restaurants in Yaoundé,
Cameroon, and turn them into structured rows.

Prices are in XAF (FCFA), written many ways — 4 500, 4.500, 4,500, "4500 F",
"4500 FCFA". Return plain integers with no separators.

Rules:
- Report ONLY what is printed. If a dish has no price on the board, leave
  priceXaf out — do not estimate one. Somebody is about to publish these to
  customers, and a guessed price is worse than a blank one.
- name: as written. Most menus here are in French; keep the French as the name
  and put a plain English version in nameFr ONLY if it is genuinely useful.
- category: group the dish the way the board does if it is grouped
  (BEIGNETS, POULET, GRILLADES, BOISSONS, SUPPLÉMENTS). If the board has no
  groups, choose a sensible short one. This is what makes the menu browsable.
- description: one short appetising line, six to twelve words, based only on
  what the dish plainly is. Never invent ingredients you cannot see named.
- unit: only when the board states one — "le kilo", "par personne", "33cl".
- Skip anything that is not a sellable item: phone numbers, opening hours,
  addresses, "merci de votre visite", delivery notices.
- If the photograph is too blurred or dark to read prices reliably, set readable
  to false and return an empty items list rather than guessing.`;

/**
 * Reads one menu photograph, or returns null.
 *
 * Null covers no key, an unreadable photo and a timeout identically, because
 * the admin does the same thing in all three: takes a better photo, or types
 * the prices from the phone call.
 */
export async function readMenuPhoto(
  photoPath: string | null,
  merchantId?: string
): Promise<AiRead<DraftItem[]>> {
  if (!kimiConfigured()) return none("No Kimi key is configured.");

  // Sniffed from the bytes, so a mislabelled upload says what it actually is
  // instead of becoming "invalid or unsupported image format" at the provider.
  const image = await readImage(photoPath);
  if (!image.dataUrl) return none(image.problem ?? "Couldn't read that file.");

  const result = await kimiJsonResult<Answer>({
    purpose: "menu.read",
    system: SYSTEM,
    user: "Read this menu or price list and return every sellable item you can make out.",
    images: [image.dataUrl],
    schema: SCHEMA as unknown as Record<string, unknown>,
    entityType: "merchant",
    entityId: merchantId,
  });

  const answer = result.answer;
  if (!answer) return none(result.error ?? "No answer came back.");
  if (answer.readable === false) {
    // The model saying it cannot make the photo out is a good answer, not a
    // failure — and it needs a different response from the person holding the
    // phone than a provider rejection does.
    return none("Couldn't make the prices out. Try again with more light, or type them from the phone call.");
  }

  const seen = new Set<string>();
  const items: DraftItem[] = [];

  for (const raw of answer.items ?? []) {
    const name = raw?.name?.trim();
    // Two characters is not a dish name, and a bare number is a price that lost
    // its label — both are the shapes that turn a menu into noise.
    if (!name || name.length < 3 || /^\d+$/.test(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const price = Number(raw.priceXaf);
    items.push({
      name: name.slice(0, 80),
      // A blank price is a real answer and is stored as unknown — the customer
      // can still order the dish and dispatch confirms the amount.
      nameFr: raw.nameFr?.trim()?.slice(0, 80) || null,
      priceXaf: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      unit: raw.unit?.trim()?.slice(0, 24) || null,
      category: raw.category?.trim()?.slice(0, 32).toUpperCase() || null,
      description: raw.description?.trim()?.slice(0, 120) || null,
    });

    if (items.length >= 60) break;
  }

  return got(items);
}
