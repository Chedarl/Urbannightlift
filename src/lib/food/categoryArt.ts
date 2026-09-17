import { dishGlyphFor, type GlyphId } from "@/lib/food/dishGlyph";

/**
 * The art on a food-type tile.
 *
 * ## Why a manifest rather than a path convention
 *
 * The obvious design is to derive `category/brochettes.jpg` from the category
 * name and let storage sort it out. That produces a **broken image** for every
 * category whose photo has not been sent yet, which on a page whose whole job
 * is to look inviting is worse than having no photograph at all — and the
 * catalogue will spend a long time in that half-filled state.
 *
 * So a photo appears only when it is listed here. A category that is not listed
 * falls back to the generated gradient from `artwork.ts` plus the drawn glyph
 * from `dishGlyph.ts`, which is a finished-looking tile rather than a gap.
 * Adding a photograph is one line.
 *
 * ## What may be photographed here, and what may not
 *
 * A picture on a **category** tile shows a kind of food — a plate of grills, a
 * pizza, a bowl of ndolé. That is true whoever cooked it, so it is ours to use.
 *
 * A picture on a **named restaurant's dish** is a claim about that kitchen, and
 * only the merchant may supply it. v56 refused generated and stock dish
 * photography for exactly that reason and this module does not reopen it: the
 * paths below are category art, and nothing here ever reaches a dish row.
 */

export interface CategoryArt {
  /** A stored path for `mediaSrc`, or null when no photograph has arrived. */
  photo: string | null;
  /** Always present, so a tile is never empty. */
  glyph: GlyphId | null;
}

/**
 * Category name → stored photo path, keyed on the lowercased category.
 *
 * Empty on purpose. The owner is sending a set of category photographs; each
 * one becomes an entry here, uploaded to `merchant-logos` (public-read) and
 * downscaled through `src/lib/uploads/downscale.ts` rather than shipped
 * full-size — `next.config.ts` runs with the image optimiser deliberately off.
 *
 * Expected keys, matching the categories the boards in this city actually use:
 * grillades · poulet · poisson · pizza · burger · beignets · boissons and a
 * catch-all `local` for the traditional plates.
 */
const CATEGORY_PHOTOS: Record<string, string> = {
  // "grillades": "merchant-logos/category/grillades.jpg",
};

/** The art for one food-type tile. */
export function categoryArt(category: string): CategoryArt {
  const key = category.trim().toLowerCase();
  return {
    photo: CATEGORY_PHOTOS[key] ?? null,
    // The glyph table already reads this vocabulary — it is the same matcher
    // the dish rows use, so a tile and the dishes under it cannot disagree
    // about what kind of food this is.
    glyph: dishGlyphFor("", category),
  };
}

/** Whether any category photograph has arrived yet. Used only by the suite. */
export function categoryPhotoCount(): number {
  return Object.keys(CATEGORY_PHOTOS).length;
}
