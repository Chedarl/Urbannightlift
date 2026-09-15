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
 * 2. **365 arbitrary font sizes**, 282 of them `text-[11px​]` and 72
 *    `text-[10px​]`. Not a scale — a habit. Every one was somebody making a
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

/**
 * The stylesheet with its comments removed.
 *
 * Needed because these comments *discuss* the things being checked — the old
 * colour, the removed aliases, the class names that were purged — and a check
 * that greps the raw file finds its own prose and reports the fault it is
 * describing as still present. `verify-wiring` in this repo learned the same
 * lesson: a mention is not a declaration.
 */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

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

console.log("\nAnd no caution surface contains gold text");
{
  /*
    The check that used to sit here asserted a `.caution-note` class existed in
    globals.css. It passed, and it was worthless: **nothing ever used the
    class.** The codebase is Tailwind utilities throughout, a bespoke class cuts
    against that grain, and so the shape sat in the stylesheet being described
    rather than applied — the same "declared but never reached a page" failure
    as the surface tokens it sat next to, committed one round later.

    This checks the collision that actually shipped. Eight components rendered
    an amber caution box with `text-gold-200` inside it, gold being the colour
    of every price in the product. Among them the closed-tonight notice on the
    home page: the most-seen caution here, an amber box with gold writing in it.

    A rule about the code beats a shape nobody adopts.
  */
  const GOLD_TEXT = /\btext-gold-\d{3}\b/;
  const CAUTION_SURFACE = /\b(?:bg|border|from|via|to)-caution\b/;

  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        fs.readFileSync(full, "utf8")
          .split("\n")
          .forEach((line, i) => {
            // Same className string: a caution ground with gold writing on it.
            if (CAUTION_SURFACE.test(line) && GOLD_TEXT.test(line)) {
              offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
            }
          });
      }
    }
  };
  walk(path.join(ROOT, "src"));

  check(
    "no component puts gold text on a caution ground",
    offenders.length === 0,
    `${offenders.length} place(s):\n       ${offenders.slice(0, 8).join("\n       ")}\n` +
      `       Gold means money here. A warning written in it is the original bug wearing a new box.`
  );

  // And the shape that was never adopted must not quietly return.
  check(
    "no unused caution class was reintroduced",
    !/\.caution-note\s*\{/.test(CODE),
    "a class the codebase does not use is a claim the code does not keep"
  );
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

  // The escape hatch is the thing to guard. A floor with `text-[10px​]` still
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

console.log("\nA token is referenced the way this Tailwind understands");
{
  /*
    The most expensive kind of style bug: one that compiles, lints, typechecks,
    builds, and produces nothing.

    Tailwind v3 read `rounded-[--radius-lg]` as `border-radius: var(--radius-lg)`.
    Tailwind v4 — which is what this app is on — does not. It reads the brackets
    literally and emits `border-radius: --radius-lg`, which is not a valid value,
    so the browser drops the whole declaration. The class is in the HTML, the
    rule is in the stylesheet, and the corner is square.

    It shipped here on nine elements — every pinned bar, both CTA buttons and the
    tracking sheet — and on a tenth, `h-[--map-h]`, where the consequence was a
    **map with zero height**: the live tracking screen rendered a 356×0 box where
    the bike was supposed to be, and the build was green the whole time.

    Nothing else in the toolchain can see this. `tsc` sees a string. The linter
    sees a string. Tailwind itself does not warn, because in v4 an arbitrary
    value is by definition whatever you put in the brackets. Only a reader who
    knows the v4 spelling — `rounded-(--radius-lg)`, parentheses — can object.

    The rule enforced here is the simpler one: **use the utility, not the
    variable.** `--radius-lg` lives in `@theme`, so Tailwind already generates
    `rounded-lg` from it. Reaching past that to name the custom property by hand
    is how you end up two spellings away from a value you could have had.
  */
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const src = fs
          .readFileSync(full, "utf8")
          // Strip comments first. This file is about to explain the bug using
          // the exact string that is the bug, and so is `LiveTrackMap`. Four
          // separate checks in this repo have now failed on their own prose.
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        for (const m of src.matchAll(/\b[a-z][a-z0-9-]*-\[(--[a-z0-9-]+)\]/g)) {
          offenders.push(`${path.relative(ROOT, full)}: ${m[0]}`);
        }
      }
    }
  };
  walk(path.join(ROOT, "src"));

  check(
    "no utility names a custom property in square brackets",
    offenders.length === 0,
    `Tailwind v4 emits these literally and the browser drops them:\n       ${offenders
      .slice(0, 8)
      .join("\n       ")}\n       Use the generated utility (rounded-lg), or v4's parenthesis form.`
  );
}

console.log("\nAnd the built stylesheet agrees — if one has been built");
{
  /*
    Everything above reads the source. This reads the artefact, because twice in
    one sitting the source was right and the output was not:

      - `--color-surface-*` were declared, and Tailwind tree-shook them out
        entirely because no component used them.
      - `.text-[10px]` and `.text-[11px]` were still generated and SHIPPED after
        every use had been removed from the app — the redesign artboards under
        `design/` document the old problem and contain those strings as
        examples, and Tailwind scans any HTML in the project. A mockup
        describing a bug was reintroducing it.

    Neither is visible from globals.css. Only the build shows them.

    Skips when there is no build rather than failing, so this stays runnable on
    a clean checkout.
  */
  const cssDir = path.join(ROOT, ".next/static/css");
  if (!fs.existsSync(cssDir)) {
    console.log("  skipped — no .next build here. Run `npx next build` to check the artefact.");
  } else {
    /*
      Only the stylesheet built from our own source. A third-party chunk is a
      different question: Leaflet ships a 12px body size with the map, and we
      neither can nor should edit its file — we override it in globals.css
      instead (see `.leaflet-container` there), which is the honest fix. Holding
      this check over vendor CSS would make it un-passable and therefore
      ignored.

      Identified by content rather than by filename hash: the chunk carrying our
      tokens is ours by definition.
    */
    const ours = fs
      .readdirSync(cssDir)
      .filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(path.join(cssDir, f), "utf8"))
      .filter((css) => css.includes("--color-caution"));

    const built = ours.join("\n");

    check(
      "the stylesheet built from our source was found",
      ours.length > 0,
      "no built CSS carries our tokens — nothing to check is not a pass"
    );

    const tooSmall = [...built.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .map((m) => parseFloat(m[1]))
      .filter((px) => px < 12.9);
    // `.75rem` and `0.75rem` and `7rem` all have to parse as themselves. The
    // first version of this rebuilt the number by string-concatenating a "0."
    // onto the captured digits, which read `font-size:7rem` — 112px — as 11.2px
    // and failed the check on a heading. Capture the whole literal instead.
    const tooSmallRem = [...built.matchAll(/font-size:\s*(\d*\.\d+|\d+)rem/g)]
      .map((m) => parseFloat(m[1]) * 16)
      .filter((px) => px > 0 && px < 12.9);

    check(
      "no rule in the shipped CSS sets a font below the floor",
      tooSmall.length === 0 && tooSmallRem.length === 0,
      `found ${[...new Set([...tooSmall, ...tooSmallRem])].join(", ")}px. ` +
        `A utility that ships is a utility somebody can use.`
    );

    check(
      "the floor itself reached the stylesheet",
      /--text-xs:\s*\.?8125rem/.test(built.replace(/\s/g, "")) || /--text-xs:0?\.8125rem/.test(built),
      "the token is declared in source but did not reach the build"
    );

    check(
      "and so did the new caution colour",
      /--color-caution:\s*#ff8c1a/i.test(built),
      "declared in source, absent from the build — which is how the surface tokens failed"
    );
  }
}

console.log("\nThe elevation ladder is the ink scale, and its rungs are visible");
{
  /*
    An earlier draft of this shipped `--color-surface-page/raised/high/peak` and
    checked *those*. It passed, and it proved nothing: they were the same four
    colours under second names, no component ever used one, and Tailwind
    tree-shook them out of the built stylesheet entirely. The check was green
    while the thing it described did not reach a single page.

    So this checks the scale components actually use.
  */
  const rungs = ["ink-950", "ink-900", "ink-800", "ink-700"].map(
    (n) => [n, token(`color-${n}`)] as const
  );
  for (const [name, value] of rungs) check(`${name} is declared`, value !== null);

  for (let i = 1; i < rungs.length; i++) {
    const [prevName, prev] = rungs[i - 1];
    const [name, value] = rungs[i];
    const d = distance(prev ?? "", value ?? "");
    check(
      `${name} is visibly above ${prevName}`,
      d > 4,
      `${prev} -> ${value} is ΔE ${d.toFixed(1)} — too close to read as a step`
    );
  }

  // The roles are the whole point: four named rungs, written down where the
  // colours are, so the next person picks a step instead of inventing one.
  for (const rung of ["ink-950", "ink-900", "ink-800", "ink-700"]) {
    check(`${rung} has its role written down`, new RegExp(`${rung}\\s+\\w`).test(CSS));
  }

  // The duplicate vocabulary must not come back.
  check(
    "there is no second set of surface tokens",
    !/--color-surface-[a-z]+\s*:/.test(CODE),
    "aliases for colours that already have names are a vocabulary nobody speaks"
  );
}

console.log(
  `\n${failures === 0 ? "A price looks like a price and a warning looks like a warning." : `${failures} check(s) FAILED — the design system has drifted.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
