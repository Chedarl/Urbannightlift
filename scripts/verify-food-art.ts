/**
 * Proves the generated art is stable, distinct, and in the brand.
 *
 * The food page looked wrong because almost nothing in the catalogue has a
 * photograph, so every card fell back to a letter on a flat tile. The fix is
 * generated art rather than stock photography — which this product has already
 * been burned by once, when invented restaurants shipped illustrated with
 * hot-linked pictures of somebody else's food.
 *
 * Three properties make generated art work and one makes it dishonest, and all
 * four are checkable offline:
 *
 *  1. **Stable** — the same restaurant looks the same on every phone, every
 *     night, after every deploy. A customer recognises "the green one" before
 *     they read the word. This is the property that quietly stops being true
 *     the moment somebody reaches for `Math.random()` or a timestamp.
 *  2. **Distinct** — two businesses on one screen must not look alike.
 *  3. **In the palette** — never pastel, never fighting the gold price text.
 *  4. **Never mistaken for a photograph.** Not testable here, but stated:
 *     nothing in this module fetches, embeds or references an image.
 *
 * Run: npx tsx scripts/verify-food-art.ts
 */
import { artworkFor, artworkStyle, initialsOf } from "../src/lib/food/artwork";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const NAMES = [
  "Chez Maman Josephine",
  "Dolcezza",
  "The Cake Princess",
  "Restaurant Le Bantou",
  "Mami Eru",
  "Tante Alice Grillades",
  "Chicken Corner",
  "Le Bistro Bastos",
  "Saveurs du Sud",
  "Nkolbisson Braisé",
];

console.log("\nThe same name always gives the same art");
for (const name of NAMES.slice(0, 4)) {
  const a = JSON.stringify(artworkFor(name));
  const b = JSON.stringify(artworkFor(name));
  check(`${name} renders identically twice`, a === b);
}
check(
  "and case or padding does not change it",
  JSON.stringify(artworkFor("  DOLCEZZA ")) === JSON.stringify(artworkFor("Dolcezza")),
  "a merchant renamed with a stray space must not change colour on the customer's screen"
);

console.log("\nDifferent names look different");
{
  const seen = new Map<string, string>();
  let clashes = 0;
  for (const name of NAMES) {
    const art = artworkFor(name);
    const signature = `${art.from}|${art.angle}`;
    const prior = seen.get(signature);
    if (prior) clashes++;
    seen.set(signature, name);
  }
  check(
    "ten real restaurant names produce ten distinguishable cards",
    clashes === 0,
    `${clashes} pair(s) shared a colour and a direction`
  );
}
check(
  "one letter apart is still visibly apart",
  artworkFor("Mami Eru").from !== artworkFor("Mami Era").from ||
    artworkFor("Mami Eru").angle !== artworkFor("Mami Era").angle
);

console.log("\nEvery colour belongs to the night palette");
for (const name of NAMES) {
  for (const scale of ["cover", "tile", "badge"] as const) {
    const art = artworkFor(name, scale);
    const lightness = [art.from, art.to].map((c) => Number(/(\d+(?:\.\d+)?)%\)$/.exec(c)?.[1] ?? 999));
    check(
      `${name} (${scale}) stays dark enough for white text`,
      lightness.every((l) => l <= 24),
      `lightness ${lightness.join(", ")} — anything brighter and the dish name stops being readable`
    );
  }
}
check(
  "a smaller tile is quieter than a cover",
  Number(/(\d+(?:\.\d+)?)%\)$/.exec(artworkFor("Dolcezza", "tile").from)?.[1]) <
    Number(/(\d+(?:\.\d+)?)%\)$/.exec(artworkFor("Dolcezza", "cover").from)?.[1]),
  "a 40px badge with a cover's sweep on it just looks dirty"
);

console.log("\nThe light never sits in a corner");
for (const name of NAMES) {
  const art = artworkFor(name);
  check(
    `${name}: the glow is inside the frame`,
    art.glowX >= 15 && art.glowX <= 85 && art.glowY >= 15 && art.glowY <= 80,
    "a glow hard against an edge reads as a rendering fault, not a design"
  );
}

console.log("\nInitials a person would actually recognise");
check("two words give two letters", initialsOf("Cake Princess") === "CP");
check(
  "the words half this city's restaurants start with are skipped",
  initialsOf("Chez Maman Josephine") === "MJ",
  "'Chez', 'Le' and 'Restaurant' as an initial tells a customer nothing"
);
check("a single word gives one letter", initialsOf("Dolcezza") === "D");
check("an accent survives", initialsOf("Édouard Grill") === "ÉG");
check("a name that is only a skip word still gives something", initialsOf("Chez") === "C");
check("punctuation is stepped over", initialsOf("(Nouveau) Bantou") === "NB");
check("an emoji is stepped over", initialsOf("🔥 Braise") === "B");
check("an empty name never renders nothing", initialsOf("") === "?" && initialsOf("   ") === "?");

console.log("\nIt produces a style a browser can use");
{
  const style = artworkStyle(artworkFor("Dolcezza"));
  check("there is a solid background under it", typeof style.backgroundColor === "string");
  check("and layered gradients over it", (style.backgroundImage.match(/gradient\(/g) ?? []).length >= 2);
  check(
    "and no image is fetched from anywhere",
    !/url\(|https?:/i.test(style.backgroundImage),
    "the whole point of generating this is that no photograph of somebody else's food appears"
  );
}

console.log("\nNothing here can throw on a strange name");
for (const odd of ["", "   ", "🔥🔥🔥", "،", "a".repeat(500), "Ω"]) {
  let ok = true;
  try {
    const art = artworkFor(odd);
    ok = typeof art.from === "string" && art.initials.length >= 1;
  } catch {
    ok = false;
  }
  check(`"${odd.slice(0, 12)}" renders rather than crashing the page`, ok);
}

console.log(
  `\n${failures === 0 ? "Every business gets its own art, and none of it is a photograph of somebody else's food." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
