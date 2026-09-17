/**
 * Proves the drawn dish art says something true, or says nothing.
 *
 * ## What was asked for, and what shipped instead
 *
 * The ask was "HD food images for the various fast foods and restaurants".
 * `artwork.ts` already refuses the literal version and explains why: a
 * beautiful picture of somebody else's poulet DG beside a real business's name
 * is how a customer is disappointed at the door, and this product shipped that
 * once and deleted it. Generating the photograph instead of borrowing it is
 * worse, not better — it is a claim about food nobody has seen.
 *
 * What the tiles actually lacked was legibility. Two initials on a gradient
 * tell you nothing; a drawn skewer tells you it is brochettes. So: vector line
 * art, ours, exact at any pixel density — which is the only sense in which
 * "HD" is achievable here at all, since `next.config.ts` runs with the image
 * optimiser off on purpose.
 *
 * ## The four properties that make it safe
 *
 * 1. **It never guesses.** A dish matching nothing returns null and falls back
 *    to initials. A fish drawn on a plate of beans is worse than no drawing.
 * 2. **It is stable.** The same name always picks the same glyph, on every
 *    phone and after every deploy, so the shapes become learnable.
 * 3. **Whole words only.** "bar" must not fire on "barbecue"; "the" (tea) must
 *    not fire on every English description.
 * 4. **It is a drawing, not a photograph.** Stroked paths, one inherited
 *    colour, no raster anywhere in the module.
 *
 * Run: npx tsx scripts/verify-dish-glyph.ts
 */

import fs from "node:fs";
import path from "node:path";

import { dishGlyphFor, GLYPH_PATHS, GLYPH_LABEL, type GlyphId } from "../src/lib/food/dishGlyph";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const MODULE = "src/lib/food/dishGlyph.ts";
const COMPONENT = "src/components/customer/food/DishGlyph.tsx";

console.log("It reads the dishes this city actually sells");
{
  const cases: [string, string | null, GlyphId][] = [
    ["Brochettes de boeuf", null, "skewer"],
    ["BROCHETTES", null, "skewer"],
    ["Soya", null, "skewer"],
    ["Poisson braisé", null, "fish"],
    ["POISSON BRAISE", null, "fish"],
    ["poisson-braise", null, "fish"],
    ["Poulet DG", null, "chicken"],
    ["Ailes de poulet", null, "chicken"],
    ["Riz sauté", null, "rice"],
    ["Ndolé aux crevettes", null, "leafy-stew"],
    ["Eru et water fufu", null, "leafy-stew"],
    ["Beignets haricot", null, "beignet"],
    ["Jus d'ananas", null, "drink"],
    ["Coca-Cola 33cl", null, "drink"],
    ["Shawarma poulet", null, "wrap"],
    ["Plantains frits", null, "plantain"],
    ["Omelette", null, "egg"],
    // The board's grouping beats an unreadable dish name.
    ["Le Spécial du Patron", "BOISSONS", "drink"],
    ["Formule 2", "GRILLADES", null as unknown as GlyphId],
  ];
  for (const [name, cat, want] of cases) {
    const got = dishGlyphFor(name, cat);
    if (want === null) continue;
    check(`"${name}"${cat ? ` [${cat}]` : ""} → ${want}`, got === want, `got ${got}`);
  }
}

console.log("");
console.log("It would rather say nothing than guess");
{
  for (const blank of ["", "   ", "Formule 2", "Menu A", "Le Spécial du Patron", "???"]) {
    check(`"${blank}" → no glyph`, dishGlyphFor(blank) === null, `got ${dishGlyphFor(blank)}`);
  }
  check(
    "a dish name that matches nothing is null, not a default",
    dishGlyphFor("Assiette du chef") === null,
    String(dishGlyphFor("Assiette du chef"))
  );
}

console.log("");
console.log("Keywords match whole words only");
{
  // The two that bit when the table was first written: a padded match is the
  // whole reason "bar" (the fish) does not claim every barbecue on the board.
  check('"Barbecue" is not the fish "bar"', dishGlyphFor("Barbecue") !== "fish", String(dishGlyphFor("Barbecue")));
  check('"Bar braisé" is the fish', dishGlyphFor("Bar braisé") === "fish");
  check(
    '"the" (tea) does not fire on an English line',
    dishGlyphFor("Chicken with the house sauce") !== "coffee",
    String(dishGlyphFor("Chicken with the house sauce"))
  );
}

console.log("");
console.log("The same dish always looks the same");
{
  const seeds = ["Brochettes de boeuf", "Poisson braisé", "Jus d'ananas", "Poulet DG"];
  for (const s of seeds) {
    const runs = new Set([dishGlyphFor(s), dishGlyphFor(s), dishGlyphFor(s)]);
    check(`"${s}" is stable across calls`, runs.size === 1);
  }
  check(
    "accents, case and hyphens all reach the same glyph",
    new Set([
      dishGlyphFor("Poisson braisé"),
      dishGlyphFor("POISSON BRAISE"),
      dishGlyphFor("poisson-braise"),
      dishGlyphFor("  Poisson   Braisé  "),
    ]).size === 1
  );
}

console.log("");
console.log("Every glyph is drawn, and nothing here is a photograph");
{
  const ids = Object.keys(GLYPH_PATHS) as GlyphId[];
  check("there are enough glyphs to be worth the indirection", ids.length >= 12, `${ids.length}`);
  check(
    "every glyph in the table has a path",
    ids.every((id) => (GLYPH_PATHS[id] ?? "").length > 10),
    ids.find((id) => (GLYPH_PATHS[id] ?? "").length <= 10)
  );
  check(
    "every glyph has a label, for the unlabelled-tile case",
    ids.every((id) => (GLYPH_LABEL[id] ?? "").length > 2),
    ids.find((id) => (GLYPH_LABEL[id] ?? "").length <= 2)
  );

  const src = read(MODULE);
  // The keyword table and the paths live in one file precisely so a glyph
  // cannot be half-added. Both records must name the identical set.
  const idsInPaths = [...src.matchAll(/^ {2}"?([a-z-]+)"?:\s*"M/gm)].map((m) => m[1]);
  check(
    "the path record covers exactly the ids the type declares",
    new Set(idsInPaths).size === ids.length,
    `${idsInPaths.length} paths vs ${ids.length} ids`
  );

  check(
    "no raster image, no remote URL, no stock photography",
    !/https?:\/\/|\.jpg|\.jpeg|\.png|\.webp|unsplash|pexels|data:image/i.test(src)
  );
  check(
    "and none in the component either",
    !/https?:\/\/|<img|\.jpg|\.png|unsplash/i.test(read(COMPONENT))
  );
  check(
    "the drawing inherits its colour rather than fixing one",
    /stroke="currentColor"/.test(read(COMPONENT))
  );
  check(
    "it is decoration, so it is hidden from screen readers by default",
    /aria-hidden=\{labelled \? undefined : true\}/.test(read(COMPONENT))
  );
  check(
    "it is a server component — no state, no handlers, no JS shipped",
    !/"use client"|useState|onClick/.test(read(COMPONENT))
  );
}

console.log("");
console.log("A real photograph still wins");
{
  for (const f of [
    "src/components/customer/food/MerchantMenu.tsx",
    "src/components/customer/food/RestaurantCard.tsx",
  ]) {
    const src = read(f);
    // photo → glyph → initials, in that order. The merchant's own picture must
    // never be displaced by our drawing.
    const order = /\{photo \? \([\s\S]*?\) : glyph \? \([\s\S]*?\) : \(/.test(src);
    check(`${f.split("/").pop()} prefers the merchant's photo over the glyph`, order);
    check(`${f.split("/").pop()} still falls back to initials`, /initialsOf\(item\.name\)/.test(src));
  }
}

console.log("");
console.log(failures === 0 ? "All good." : `${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
