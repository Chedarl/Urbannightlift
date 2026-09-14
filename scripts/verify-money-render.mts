/**
 * Proves money survives the trip onto paper.
 *
 * ## The bug this was written after
 *
 * Every PDF receipt and order summary this product has ever issued printed
 * thousands with a **slash through the middle**: `125/000 XAF`.
 *
 * Not a crash, not a warning, not a wrong number. `toLocaleString("fr-FR")`
 * groups French numerals with U+202F NARROW NO-BREAK SPACE, which is correct,
 * and which renders perfectly in the browser. The PDFs are drawn with
 * `Helvetica` — a PDF standard-14 base font, locked to WinAnsiEncoding — and
 * U+202F is not in WinAnsi. It does not drop out and it does not fall back to a
 * space. It is written as byte `0x2F`, and `0x2F` in that encoding is the
 * **solidus**. A receipt is a document a customer keeps and may show to
 * somebody, and ours had a slash through the price.
 *
 * ## Why this suite renders a real PDF
 *
 * Because every cheaper check passes. The arithmetic is right, the types are
 * right, the string is right, and the same string is flawless on the screen
 * next to it. The defect exists only in the encoding step — so the only honest
 * assertion is to render a document with the real renderer and read the bytes
 * out of its content stream.
 *
 * That is also the general lesson, and it is the second time this month it has
 * cost something: **a test that inspects the value instead of the artefact
 * proves the value.** The food artwork suite counted the word "gradient" in a
 * string while the CSS it described was invalid and nothing rendered. Same
 * shape, different module. So this one goes all the way to the bytes.
 *
 * ## Why this one is `.mts`
 *
 * `@react-pdf/renderer` is ESM-only, and its dependencies are not reachable
 * through the CommonJS output the other suites compile to. The extension is the
 * only way to render the artefact rather than a stand-in for it — and rendering
 * the artefact is the entire point of the suite. It still matches the
 * `scripts/verify-*` convention.
 *
 * Run: npx tsx scripts/verify-money-render.mts
 */

import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { formatXaf, groupXaf } from "../src/lib/utils";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

/** Characters WinAnsi cannot carry, and what each silently becomes. */
const NOT_IN_WINANSI: [string, string, string][] = [
  [" ", "U+202F narrow no-break space", "what ICU uses for fr-FR — becomes the slash"],
  [" ", "U+2009 thin space", "the other tempting 'typographic' space"],
  [" ", "U+2007 figure space", "looks purpose-built for numbers; still absent"],
];

console.log("The formatter emits nothing a PDF font cannot carry");
for (const amount of [0, 1, 999, 1000, 2500, 125_000, 1_500_000, -3000]) {
  const text = formatXaf(amount);
  for (const [ch, label, why] of NOT_IN_WINANSI) {
    check(
      `${amount}: no ${label}`,
      !text.includes(ch),
      `formatXaf(${amount}) = ${JSON.stringify(text)} — ${why}`
    );
  }
}

console.log("\nAnd it still groups the way a reader expects");
check("999 is not grouped", groupXaf(999) === "999");
check("1000 is grouped once", groupXaf(1000) === "1 000");
check("125000 is grouped once", groupXaf(125_000) === "125 000");
check("1500000 is grouped twice", groupXaf(1_500_000) === "1 500 000");
check("zero is just zero", groupXaf(0) === "0");
check("a negative keeps its sign", groupXaf(-3000) === "-3 000");
check("a stray decimal is rounded, not printed", groupXaf(2499.6) === "2 500");
check("null renders a dash rather than the word null", formatXaf(null) === "—");
check("undefined too", formatXaf(undefined) === "—");

/**
 * Pulls the text a PDF actually draws back out of its content stream.
 *
 * The strings inside `Tj`/`TJ` operators are the glyph codes the viewer will
 * paint, already encoded — which is exactly the layer the bug lived in, and the
 * reason this reads the stream rather than trusting the input. WinAnsiEncoding
 * is byte-identical to cp1252, which `latin1` approximates closely enough for
 * the range that matters here.
 */
function drawnText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  let out = "";

  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = m[1];
    try {
      body = zlib.inflateSync(Buffer.from(body, "latin1")).toString("latin1");
    } catch {
      // Uncompressed streams are read as they are.
    }
    if (!body.includes("Tj") && !body.includes("TJ")) continue;
    for (const hex of body.matchAll(/<([0-9a-fA-F]+)>/g)) {
      out += Buffer.from(hex[1], "hex").toString("latin1");
    }
  }
  return out;
}

// tsx compiles these suites to CommonJS, which has no top-level await, so the
// rendering half lives in a function rather than at the file's top level.
async function onPaper() {
  console.log("\nRendered into a real PDF, the price reads as a price");
  const h = React.createElement;
  const amounts = [1000, 2500, 125_000, 1_500_000];

  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: { padding: 40, fontSize: 12, fontFamily: "Helvetica" } },
      ...amounts.map((n) => h(Text, { key: n }, formatXaf(n)))
    )
  );

  // Both PDFs in the product use Helvetica, so this reproduces their conditions
  // rather than a friendlier embedded font that would hide the fault.
  const drawn = await renderToBuffer(doc as never).then(drawnText);

  check(
    "nothing is drawn as a slash",
    !drawn.includes("/"),
    `the page draws ${JSON.stringify(drawn)} — a slash here is U+202F being transcoded to 0x2F`
  );

  for (const n of amounts) {
    // Both spellings are correct on paper: WinAnsi 0xA0 paints a space.
    const asNbsp = formatXaf(n);
    const asSpace = asNbsp.replace(/ /g, " ");
    check(
      `${n} is drawn in full`,
      drawn.includes(asNbsp) || drawn.includes(asSpace),
      `expected ${JSON.stringify(asNbsp)} somewhere in ${JSON.stringify(drawn)}`
    );
  }

  check(
    "and the grouping survived rather than being dropped",
    /125[  ]000/.test(drawn),
    `a separator that vanished entirely would print 125000 — the page drew ${JSON.stringify(drawn)}`
  );
}

void onPaper().then(() => {
  console.log(
    `\n${failures === 0 ? "Money reads the same on a screen and on paper." : `${failures} check(s) FAILED — a price is not rendering as written.`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
});
