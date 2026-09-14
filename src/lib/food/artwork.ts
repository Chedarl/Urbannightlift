/**
 * Art for a business that has not sent us a photograph yet.
 *
 * ## Why this exists rather than a stock photo
 *
 * The food page was reported as not looking the part, and the reason is
 * structural rather than cosmetic: **almost nothing in this catalogue has a
 * photograph.** Merchants send a logo when they sign up, sometimes; a cover
 * photo, rarely; a picture per dish, essentially never. So every card fell back
 * to a letter on a flat tile, and a page of flat tiles reads as a page that
 * failed to load.
 *
 * The obvious fix is the one this product has already been burned by twice, and
 * it is forbidden. A previous version of this screen shipped invented
 * restaurants illustrated with hot-linked stock photography; putting a
 * beautiful picture of somebody else's poulet DG beside a real business's name
 * is how a customer is disappointed at the door, and it is also somebody else's
 * copyright. **No photograph appears here that the business did not send us.**
 *
 * So the answer is to stop pretending a photo is missing and make the absence
 * itself worth looking at: generated art, ours, unique to each business.
 *
 * ## What makes it good rather than just coloured
 *
 * 1. **Stable.** The art is derived from the name, so a restaurant looks the
 *    same on every phone, every night, and after every deploy. A customer
 *    recognises "the green one" before they read the word, which is most of
 *    what a photograph was doing anyway.
 * 2. **Distinct.** Two businesses on the same screen must not look alike. The
 *    hue comes off a hash with enough spread that neighbours in a list are
 *    visibly different.
 * 3. **In the brand.** Every colour is a deep, saturated night tone that sits
 *    with the ink/violet/gold palette. Nothing pastel, nothing that fights the
 *    gold price text sitting on top of it.
 * 4. **Never mistaken for a photograph.** Layered gradients and a soft mesh —
 *    plainly a graphic. The honesty is the point: a customer must never think
 *    they have seen this restaurant's actual food.
 *
 * Pure and proved by `scripts/verify-food-art.ts`, because "the same name gives
 * the same art" is exactly the kind of property that quietly stops being true.
 */

/** Where the art is going, which decides how much of it there is. */
export type ArtScale = "cover" | "tile" | "badge";

export interface Artwork {
  /** The two ends of the base sweep, as CSS colours. */
  from: string;
  to: string;
  /** A third tone for the mesh blob, lifted off the base. */
  glow: string;
  /**
   * The same tone at the opacity the mesh is actually drawn with.
   *
   * This exists because of a bug that made the whole module do nothing. The
   * style builder used to write `` `${art.glow}55` `` — the hex-alpha trick,
   * which works on `#7b2cbf` and is **invalid on `hsl(303 80% 44%)`**. A colour
   * stop of `hsl(303 80% 44%)55` does not parse, an unparsable stop invalidates
   * its gradient, and an invalid value drops the entire `background-image`
   * declaration — so *both* gradients vanished and every card in the catalogue
   * rendered as one flat block of colour. The generated art was never once seen.
   *
   * The alpha is baked in here, by the code that knows the colour's syntax,
   * rather than concatenated by the code that consumes it.
   */
  glowSoft: string;
  /** Degrees for the linear sweep, so no two neighbours share a direction. */
  angle: number;
  /** Where the glow sits, in percent, so the light is not always top-left. */
  glowX: number;
  glowY: number;
  /** The letter shown when there is nothing else. Never more than two. */
  initials: string;
}

/**
 * A small, stable, well-spread hash.
 *
 * FNV-1a. Chosen over anything cleverer because it is four lines, has no
 * dependencies, and — the part that matters — is **identical in every
 * JavaScript runtime**, which is what "the same on every phone" requires.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The hues we are willing to use, and why these.
 *
 * Not the full circle. Yellows and light greens go muddy against a near-black
 * ground and fight the gold used for prices, and a page where every card picks
 * freely from 360° looks like a colour test rather than a brand. These eight
 * are spaced far enough apart to be told apart at a glance and all belong to
 * the same night.
 */
const HUES = [
  268, // violet — the house colour
  292, // orchid
  318, // magenta
  348, // rose
  14, // ember
  32, // amber, the food accent
  172, // teal
  208, // deep blue
];

/**
 * Turns a name into art.
 *
 * @param seed The business or dish name. Anything stable and unique to it.
 * @param scale How prominent this is, which sets how far the tones travel. A
 *   cover can carry a strong sweep; a 40 px badge with the same sweep just
 *   looks dirty.
 */
export function artworkFor(seed: string, scale: ArtScale = "cover"): Artwork {
  const key = (seed ?? "").trim().toLowerCase() || "urban night lift";
  const h = hash(key);

  const hue = HUES[h % HUES.length];
  // A second, related hue for the far end of the sweep. Adjacent rather than
  // complementary: two ends of one light, not two colours in an argument.
  const hue2 = (hue + 26 + ((h >>> 8) % 22)) % 360;

  // Darker for the small scales. A tile is mostly seen out of the corner of the
  // eye behind a dish name, and a loud one steals attention the name needs.
  const depth = scale === "cover" ? 0 : scale === "tile" ? 6 : 10;

  return {
    from: `hsl(${hue} 62% ${22 - depth}%)`,
    to: `hsl(${hue2} 54% ${11 - depth / 2}%)`,
    glow: `hsl(${hue2} 80% ${44 - depth}%)`,
    // 0.33 is the same weight `55` was reaching for (0x55/0xff ≈ 0.33), written
    // in the one syntax that is legal inside `hsl()`.
    glowSoft: `hsl(${hue2} 80% ${44 - depth}% / 0.33)`,
    // 12 directions rather than 360, so the variation is felt without any card
    // ending up with an awkward near-horizontal band.
    angle: ((h >>> 4) % 12) * 30,
    // Kept off the edges: a glow in a corner reads as a rendering fault.
    glowX: 18 + ((h >>> 12) % 65),
    glowY: 16 + ((h >>> 18) % 60),
    initials: initialsOf(seed),
  };
}

/**
 * One or two letters, from the words that carry the name.
 *
 * "Chez Maman Josephine" is CM, not C — two letters are far more
 * distinguishable in a list than one, and half the restaurants in this city
 * begin with "Chez", "Le" or "Restaurant". Those leading words are skipped for
 * exactly that reason.
 */
const SKIP = new Set(["chez", "le", "la", "les", "restaurant", "resto", "the", "de", "du", "des", "au", "aux"]);

export function initialsOf(seed: string): string {
  const words = (seed ?? "")
    .trim()
    .split(/[\s'’-]+/)
    .filter((w) => w.length > 0);

  const meaningful = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const use = meaningful.length > 0 ? meaningful : words;
  if (use.length === 0) return "?";

  const first = firstLetter(use[0]);
  const second = use.length > 1 ? firstLetter(use[1]) : "";
  return (first + second).toUpperCase() || "?";
}

/**
 * The first character that is actually a letter or a digit.
 *
 * A name beginning with an emoji or a bracket is not unusual on a business page
 * pasted out of Instagram, and an initial of "(" tells a customer nothing.
 */
function firstLetter(word: string): string {
  for (const ch of word) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch;
  }
  return "";
}

/**
 * The whole thing as one inline style, ready for a `div`.
 *
 * Returned as a style object rather than a class because the colours are
 * computed per business — there is no set of Tailwind classes that covers this,
 * and generating them at runtime is exactly what Tailwind's compiler cannot do.
 */
export function artworkStyle(art: Artwork): Record<string, string> {
  return {
    backgroundColor: art.from,
    backgroundImage: [
      // The mesh blob first, so it sits over the sweep.
      `radial-gradient(60% 80% at ${art.glowX}% ${art.glowY}%, ${art.glowSoft}, transparent 70%)`,
      `linear-gradient(${art.angle}deg, ${art.from}, ${art.to})`,
    ].join(", "),
  };
}
