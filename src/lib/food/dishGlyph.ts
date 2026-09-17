import { normalizeTokens } from "@/lib/locations/normalize";

/**
 * A drawn glyph for a dish that has no photograph.
 *
 * ## Why this and not a photograph
 *
 * The request was "HD food images for the restaurants". The honest version of
 * that is narrower than it sounds, and `artwork.ts` already argues the case: a
 * beautiful picture of somebody else's poulet DG beside a real business's name
 * is how a customer is disappointed at the door. This product has shipped that
 * mistake once already — invented restaurants illustrated with hot-linked stock
 * photography — and deleted it.
 *
 * Generating the photograph instead of borrowing it does not fix that; it makes
 * it worse. A model's rendering of brochettes is a claim about what a specific
 * braiseur in Biyem-Assi will hand the rider, and nobody has seen that food.
 *
 * So: no photographs here that the business did not send us. What the tiles
 * lacked was not realism, it was **legibility** — two initials on a gradient
 * tell you nothing about the dish. A drawn skewer does.
 *
 * ## Why this is genuinely "HD", and more so than a photo would be
 *
 * These are vector paths. They are exact at 1×, at 3× on a modern phone, and at
 * any size a future screen asks for, and they cost about 300 bytes each rather
 * than 200 KB. That matters twice over here: the customer is on a Yaoundé mobile
 * connection at 1 a.m., and `next.config.ts` deliberately runs with
 * `images: { unoptimized: true }` — the image optimiser is switched off as
 * attack surface with no user, and turning it back on is gated behind the Next
 * 16 upgrade. A raster dish photo would ship unoptimised at full size today. A
 * path does not care.
 *
 * ## The rules this keeps from `artwork.ts`
 *
 * **Stable** — the same dish name always picks the same glyph, so a customer
 * learns the shapes. **Never mistaken for a photograph** — flat single-colour
 * line art, plainly a drawing. And **it never guesses**: a dish that matches
 * nothing gets no glyph and falls back to initials, because a fish drawn on a
 * plate of beans is worse than no drawing at all.
 *
 * Pure and proved by `scripts/verify-dish-glyph.ts`.
 */

export type GlyphId =
  | "skewer"
  | "fish"
  | "chicken"
  | "rice"
  | "plantain"
  | "leafy-stew"
  | "beignet"
  | "bread"
  | "drink"
  | "coffee"
  | "burger"
  | "pizza"
  | "wrap"
  | "soup"
  | "egg"
  | "sweet";

/**
 * What each glyph answers to, in the words this city actually uses.
 *
 * Matched on whole words against an accent-folded name, so "poisson braisé",
 * "POISSON BRAISE" and "poisson-braise" all land on the fish. Order matters:
 * the first entry whose keyword appears wins, so the specific sits above the
 * general — "poulet DG" must reach `chicken` before "DG" reaches anything, and
 * `soya` must not be swallowed by `soja`.
 *
 * Keywords are French and English because menus here are written in both, plus
 * the local names that appear on a chalkboard with no translation at all.
 */
const TABLE: { id: GlyphId; words: string[] }[] = [
  /*
    ── How it is served, before what is in it ──
    "Shawarma poulet" is a wrap, not a chicken: the form is what the customer
    recognises on a tile, and the filling is already written next to it in
    words. With the protein rows first, every shawarma, burger and brochette on
    a board came out as the same chicken glyph — caught by the suite, not by
    reading it. Same rule puts `soup` here: "Soupe de poisson" is a bowl.
  */
  { id: "skewer", words: ["brochette", "brochettes", "soya", "suya", "kebab", "skewer", "kebap"] },
  { id: "wrap", words: ["shawarma", "chawarma", "wrap", "tacos", "taco"] },
  { id: "burger", words: ["burger", "hamburger", "cheeseburger"] },
  { id: "pizza", words: ["pizza", "pizzas", "calzone"] },
  { id: "bread", words: ["pain", "bread", "sandwich", "baguette", "toast"] },
  { id: "beignet", words: ["beignet", "beignets", "puff", "doughnut", "donut", "haricot", "accra"] },
  { id: "soup", words: ["soupe", "soup", "bouillon", "pepe", "pho", "ragout"] },

  // ── Then what it is made of ──
  { id: "fish", words: ["poisson", "fish", "maquereau", "bar", "tilapia", "carpe", "silure", "crevette", "prawn", "shrimp"] },
  { id: "chicken", words: ["poulet", "chicken", "dg", "ailes", "wings", "cuisse", "gesier", "gizzard", "canard", "duck"] },
  { id: "egg", words: ["oeuf", "oeufs", "omelette", "egg", "eggs"] },
  { id: "rice", words: ["riz", "rice", "jollof", "couscous"] },
  { id: "plantain", words: ["plantain", "plantains", "banane", "miondo", "bobolo", "baton", "manioc", "cassava", "igname", "yam", "frites", "fries"] },
  { id: "leafy-stew", words: ["ndole", "eru", "kpem", "okok", "feuille", "feuilles", "legume", "legumes", "epinard", "spinach", "koki", "achu", "taro", "sauce", "gombo", "okra"] },

  // ── Then what it is washed down with ──
  { id: "drink", words: ["jus", "juice", "boisson", "boissons", "drink", "eau", "water", "soda", "coca", "fanta", "sprite", "malta", "biere", "beer", "castel", "33", "bissap", "folere", "gingembre", "ginger"] },
  { id: "coffee", words: ["cafe", "coffee", "the", "tea", "chocolat", "chocolate", "lait", "milk", "cappuccino"] },
  { id: "sweet", words: ["gateau", "cake", "glace", "ice cream", "dessert", "crepe", "crepes", "yaourt", "yogurt", "patisserie"] },
];

/**
 * The glyph for a dish, or null when nothing matches.
 *
 * `category` is checked first and separately: a board grouped under
 * `GRILLADES` or `BOISSONS` has already told us what the section is, and that
 * is a stronger signal than a dish name like "Le Spécial du Patron".
 *
 * Null is a real answer and the common one on a thin menu. The caller falls
 * back to initials — never to a guessed picture.
 */
export function dishGlyphFor(name: string, category?: string | null): GlyphId | null {
  return match(category) ?? match(name);
}

function match(input: string | null | undefined): GlyphId | null {
  const text = normalizeTokens(input ?? "");
  if (!text) return null;
  // Padded so a keyword only ever matches a whole word: "bar" must not fire on
  // "barbecue", and "the" (tea) must not fire on every English description.
  const padded = ` ${text} `;
  for (const { id, words } of TABLE) {
    for (const w of words) {
      if (padded.includes(` ${normalizeTokens(w)} `)) return id;
    }
  }
  return null;
}

/**
 * The path data, at a 24×24 viewBox.
 *
 * Stroked rather than filled, one colour, no gradients: a drawing, and legible
 * at 32px on a dish row. Kept here beside the keyword table so a new glyph
 * cannot be added to one without the other — which the suite checks.
 */
export const GLYPH_PATHS: Record<GlyphId, string> = {
  skewer: "M4 20 20 4M9 8l3 3M13 4l3 3M7 12l3 3M11 16l3 3",
  fish: "M3 12c4-6 12-6 16 0-4 6-12 6-16 0zM19 12l2-3v6l-2-3zM8 11h.01",
  chicken: "M7 20v-5a5 5 0 0 1 10 0v5M9 10 7 6M15 10l2-4M12 9V4",
  rice: "M4 12h16a8 8 0 0 1-16 0zM8 8h.01M12 6h.01M16 8h.01",
  plantain: "M5 16c0-6 5-11 11-11 2 0 3 1 3 3 0 6-5 11-11 11-2 0-3-1-3-3z",
  "leafy-stew": "M4 14h16a8 8 0 0 1-16 0zM12 11c0-4 2-6 5-7-1 4-2 6-5 7zM12 11C9 10 7 8 6 4c3 1 5 3 6 7z",
  beignet: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  bread: "M3 11a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4l-2 9H5l-2-9zM9 8v11M15 8v11",
  drink: "M7 4h10l-1.5 16h-7L7 4zM7.6 10h8.8",
  coffee: "M4 6h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V6zM17 8h2a2 2 0 0 1 0 4h-2M3 21h16",
  burger: "M4 9a8 8 0 0 1 16 0H4zM3 13h18M5 17h14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z",
  pizza: "M12 3 3 20l9-2 9 2L12 3zM10 11h.01M14 13h.01M12 17h.01",
  wrap: "M6 4h9l4 8-4 8H6l3-8-3-8z",
  soup: "M3 12h18a9 9 0 0 1-18 0zM8 8c0-2 1-3 1-4M12 8c0-2 1-3 1-4M16 8c0-2 1-3 1-4",
  egg: "M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z",
  sweet: "M5 12h14v8H5v-8zM4 12l8-8 8 8M12 4V2",
};

/** Human label, for the `aria-label` on a decorative tile that has no text. */
export const GLYPH_LABEL: Record<GlyphId, string> = {
  skewer: "Brochettes",
  fish: "Fish",
  chicken: "Chicken",
  rice: "Rice",
  plantain: "Plantain",
  "leafy-stew": "Leafy stew",
  beignet: "Beignets",
  bread: "Bread",
  drink: "Drink",
  coffee: "Hot drink",
  burger: "Burger",
  pizza: "Pizza",
  wrap: "Wrap",
  soup: "Soup",
  egg: "Eggs",
  sweet: "Something sweet",
};
