/**
 * Proves the design system is still a system.
 *
 * ## What went wrong, and why a test rather than a note
 *
 * Three things were true of this codebase at once, and each of them is the kind
 * of fault that creeps back the first time somebody is in a hurry:
 *
 * 1. **`--color-caution` was byte-identical to `--color-gold-400`** — both
 *    `#d4af37`. Every price in the product is gold. So a warning and an amount
 *    of money rendered in exactly the same colour, and on the order review
 *    screen they sit six lines apart: the total the customer is about to pay,
 *    and the note saying the price might still change. Nothing separated them.
 *
 * 2. **365 arbitrary font sizes**, 282 of them `text-[11px]` and 72
 *    `text-[10px]`. Not a scale — a habit. Every one was somebody making a
 *    label fit, and the sum was a product whose small print is 10px, read
 *    one-handed outdoors at night, containing order codes and prices.
 *
 * 3. **Eight card surfaces with no elevation ladder**, so nothing on a screen
 *    said what sat above what.
 *
 * None of these is a bug any compiler or existing suite could see. They are
 * facts about a stylesheet, and the only thing that keeps them fixed is
 * something that reads the stylesheet and objects. So that is what this is.
 *
 * It parses `globals.css` rather than a copy of the values, because a test that
 * restates the constants it is checking proves only that I can type them twice.
 *
 * Run: npx tsx scripts/verify-design-tokens.ts
 */

import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

/** Reads one custom property out of the `@theme` block. */
function token(name: string): string | null {
  const m = CSS.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

/** #rrggbb -> [r,g,b], for comparing colours as colours rather than as text. */
function rgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * How far apart two colours look, as CIE76 ΔE in Lab.
 *
 * The first version of this measured plain Euclidean distance in RGB, and that
 * was the wrong instrument for the question. RGB distance treats a step in blue
 * as worth the same as a step in green, which the eye does not; it scored the
 * first candidate amber at 34 against gold and the (far more distinguishable)
 * red at 38, which is close to backwards. Lab is built so that equal numbers
 * mean roughly equal perceived difference, which is the only thing being asked
 * here: **can somebody tell these apart on a phone, at night.**
 *
 * Rough reading: ΔE under ~2 is invisible, ~10 is noticeable side by side, and
 * 25+ is unmistakably a different colour.
 */
function distance(a: string, b: string): number {
  const lab = (hex: string): [number, number, number] | null => {
    const c = rgb(hex);
    if (!c) return null;
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, bl] = c.map(lin);
    const X = (r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047;
    const Y = r * 0.2126 + g * 0.7152 + bl * 0.0722;
    const Z = (r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const [fx, fy, fz] = [f(X), f(Y), f(Z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };

  const x = lab(a);
  const y = lab(b);
  if (!x || !y) return Number.POSITIVE_INFINITY;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * The bar every status colour must clear against every other.
 *
 * 25 rather than something larger because the palette genuinely is crowded:
 * caution sits between gold at hue 46° and restricted at 13°, so pushing it
 * away from one moves it toward the other. 25 is comfortably past "noticeable"
 * and is met on both sides with room to spare (36.8 and 32.0). It is not a
 * threshold picked to make the current value pass — the value was picked to
 * maximise the smaller gap, and this is the bar it cleared.
 */
const MIN_DELTA_E = 25;

console.log("Caution does not wear the colour of money");
{
  const caution = token("color-caution");
  check("there is a caution colour at all", caution !== null);

  // Every gold in the palette, not just the one it collided with: moving the
  // clash from gold-400 to gold-300 would be no fix at all.
  const golds = [...CSS.matchAll(/--color-gold-(\d+)\s*:\s*([^;]+);/g)].map((m) => [`gold-${m[1]}`, m[2].trim()] as const);
  check("and the golds are still declared", golds.length >= 3);

  for (const [name, gold] of golds) {
    const d = distance(caution ?? "", gold);
    check(
      `caution is distinguishable from ${name}`,
      d > MIN_DELTA_E,
      `caution ${caution} vs ${name} ${gold} — ΔE ${d.toFixed(1)}, needs > ${MIN_DELTA_E}. ` +
        `These were byte-identical once; a warning and a price must never look the same.`
    );
  }

  // The specific regression, named so it reads as itself in a failure log.
  check(
    "caution is not #d4af37",
    (caution ?? "").toLowerCase() !== "#d4af37",
    "that is gold-400, the colour of every price in the product"
  );

  check(
    "and it is still distinct from the other two states",
    distance(caution ?? "", token("color-restricted") ?? "") > MIN_DELTA_E &&
      distance(caution ?? "", token("color-safe") ?? "") > MIN_DELTA_E,
    `restricted ΔE ${distance(caution ?? "", token("color-restricted") ?? "").toFixed(1)}, ` +
      `safe ΔE ${distance(caution ?? "", token("color-safe") ?? "").toFixed(1)}`
  );
}

console.log("\nColour is never the only thing carrying a caution");
{
  // Roughly one man in twelve cannot separate amber from gold, and nor can
  // anybody reading a phone outdoors at 2 a.m. The shape exists so a caution
  // is also a rule and an icon.
  check("the caution-note shape exists", /\.caution-note\s*\{/.test(CSS));
  const block = CSS.match(/\.caution-note\s*\{([^}]*)\}/)?.[1] ?? "";
  check("it draws a left rule", /border-left\s*:/.test(block), "colour alone was the original fault");
  check("the rule uses the caution token rather than a literal", /var\(--color-caution\)/.test(block));
  check("and it tints its ground", /background\s*:/.test(block));
}

console.log("\nNothing in the product is smaller than the 13px floor");
{
  const xs = token("text-xs");
  check("the xs step is declared", xs !== null, "Tailwind's 12px default is below the floor");

  const rem = parseFloat(xs ?? "0");
  const px = /rem/.test(xs ?? "") ? rem * 16 : rem;
  check(
    "and it is 13px, not Tailwind's 12",
    Math.abs(px - 13) < 0.2,
    `text-xs is ${xs} (${px}px). This app is read one-handed, outdoors, at night.`
  );

  // The escape hatch is the thing to guard. A floor with `text-[10px]` still
  // available is not a floor, and 354 of those is how it got here.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const src = fs.readFileSync(full, "utf8");
        for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
          offenders.push(`${path.relative(ROOT, full)}: text-[${m[1]}px]`);
        }
      }
    }
  };
  walk(path.join(ROOT, "src"));

  check(
    "and no component sets its own font size in pixels",
    offenders.length === 0,
    `${offenders.length} arbitrary size(s), starting with:\n       ${offenders.slice(0, 6).join("\n       ")}`
  );
}

console.log("\nThere is an elevation ladder, and its steps are visible");
{
  const steps = ["surface-page", "surface-raised", "surface-high", "surface-peak"].map(
    (n) => [n, token(`color-${n}`)] as const
  );
  for (const [name, value] of steps) check(`${name} is declared`, value !== null);

  // A ladder whose rungs are a nudge apart is not a ladder. Each step has to be
  // a change somebody can actually see on a phone at night.
  for (let i = 1; i < steps.length; i++) {
    const [prevName, prev] = steps[i - 1];
    const [name, value] = steps[i];
    const d = distance(prev ?? "", value ?? "");
    check(
      `${name} is visibly above ${prevName}`,
      d > 4,
      `${prev} -> ${value} is ΔE ${d.toFixed(1)} — too close to read as a step`
    );
  }
}

console.log(
  `\n${failures === 0 ? "A price looks like a price and a warning looks like a warning." : `${failures} check(s) FAILED — the design system has drifted.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
