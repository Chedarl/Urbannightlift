import { GLYPH_PATHS, GLYPH_LABEL, type GlyphId } from "@/lib/food/dishGlyph";

/**
 * The drawn dish, over the generated tile.
 *
 * Deliberately not a client component: it takes a glyph id and draws it, with
 * no state and no handlers, so it renders on the server and costs the customer
 * nothing in JavaScript.
 *
 * `currentColor` and an opacity, rather than a colour of its own — the tile
 * behind it is a per-business gradient from `artworkFor`, and a fixed ink would
 * disappear on half of them. Inheriting means the glyph always sits in the same
 * relationship to its own tile.
 *
 * `aria-hidden` because it is decoration: the dish's name is already the row's
 * text, and a screen reader announcing "Brochettes, Brochettes de boeuf" is
 * worse than silence. The label exists for the one case where a tile carries no
 * text at all.
 */
export function DishGlyph({
  id,
  size = 26,
  labelled = false,
}: {
  id: GlyphId;
  size?: number;
  labelled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-90"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? GLYPH_LABEL[id] : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <path d={GLYPH_PATHS[id]} />
    </svg>
  );
}
