/**
 * Proves that nothing customer-facing is written in one language only.
 *
 * The owner reported words in the wrong language and the obvious suspect — the
 * dictionary — turned out to be innocent: 565 keys on each side, none missing,
 * no French in `en.json`, and the 23 entries identical in both files are all
 * legitimately identical ("WhatsApp", "MTN Mobile Money", "Yaoundé").
 *
 * The leak was in components that **never asked the dictionary for anything**.
 * `WatchDelivery` — the page a customer sends to somebody worried about them at
 * 1 AM — was English top to bottom, and nothing anywhere would have said so. A
 * missing key is loud; a component that simply never translates is silent, and
 * silence is what let this sit.
 *
 * So this checks the thing that actually broke:
 *
 *  - **The dictionaries agree.** Same keys both sides, nothing empty, and no
 *    obviously-French sentence sitting in the English file.
 *  - **Nothing customer-facing hardcodes a sentence.** Any string that reaches a
 *    person — JSX text, `placeholder`, `title`, `aria-label` — must be inside a
 *    `fr ? … : …`, a `t(…)` / `translate(…)` call, or a `{ en, fr }` pair.
 *
 * Deliberately limited to the customer's side of the product. The staff apps are
 * English by decision, and pretending otherwise would fill this list with noise
 * until nobody read it.
 *
 * Run: npx tsx scripts/verify-i18n.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import en from "../src/lib/i18n/dictionaries/en.json";
import fr from "../src/lib/i18n/dictionaries/fr.json";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

/* ------------------------------------------------------------------ *
 * 1. The dictionaries
 * ------------------------------------------------------------------ */

function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object") flatten(value, path, out);
      else if (typeof value === "string") out[path] = value;
    }
  }
  return out;
}

const EN = flatten(en);
const FR = flatten(fr);

console.log("\nThe two dictionaries say the same things");
const missingFr = Object.keys(EN).filter((k) => !(k in FR));
const missingEn = Object.keys(FR).filter((k) => !(k in EN));
check(`every English key has a French one (${Object.keys(EN).length} keys)`, missingFr.length === 0, missingFr.slice(0, 8).join(", "));
check("and nothing is French-only", missingEn.length === 0, missingEn.slice(0, 8).join(", "));
check(
  "no key is blank",
  ![...Object.entries(EN), ...Object.entries(FR)].some(([, v]) => v.trim() === "")
);

// Words that do not appear in English text. A hit means a French sentence was
// pasted into the English file — the "vice versa" half of the report.
const FRENCH_ONLY = /\b(votre|vous|nous|est|pour|avec|dans|une|des|livraison|commande|nuit|heure|merci)\b/i;
const frenchInEnglish = Object.entries(EN).filter(([, v]) => FRENCH_ONLY.test(v));
check(
  "no French sentence is sitting in en.json",
  frenchInEnglish.length === 0,
  frenchInEnglish.slice(0, 5).map(([k, v]) => `${k} = ${v}`).join("\n       ")
);

/*
  Placeholders, which are the half of a translation nobody proofreads.

  A key like `"sentAgo": "last sent {time} ago · {n} updates"` is not one string,
  it is a **frame with two holes**, and the French value has to have the same two
  holes or the French reader loses a number with no error anywhere. Nothing in
  the toolchain can see that: both sides are valid JSON, both sides are French
  and English respectively, and the missing `{n}` only shows up as a sentence
  that quietly stops making sense.

  This is the cheap half of the lesson that produced `Freshness` in
  `lib/orders/eta.ts`. The expensive half — a *phrase* being substituted into a
  hole meant for a *duration*, which shipped "last sent just now ago" to every
  rider actively sharing their location — is not decidable from the dictionary
  and is now prevented by the type instead. This catches the half that is.
*/
{
  const holes = (v: string) => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const mismatched: string[] = [];
  for (const [key, enValue] of Object.entries(EN)) {
    const frValue = FR[key];
    if (typeof frValue !== "string") continue;
    const a = holes(enValue);
    const b = holes(frValue);
    if (a.join("|") !== b.join("|")) {
      mismatched.push(`${key}: en{${a.join(",")}} vs fr{${b.join(",")}}`);
    }
  }
  check(
    "and both sides of a key have the same placeholders",
    mismatched.length === 0,
    mismatched.slice(0, 8).join("\n       ")
  );
}

/* ------------------------------------------------------------------ *
 * 2. The components
 * ------------------------------------------------------------------ */

/** Where a customer actually looks. Staff screens are English by decision. */
const ROOTS = [
  "src/components/customer",
  "src/components/shared",
  "src/components/merchant",
  "src/app/account",
  "src/app/order",
  "src/app/track",
  "src/app/help",
  "src/app/w",
];

/**
 * Files with no words in them. Every entry is a deliberate decision, not a
 * backlog: a design token, a wrapper, an icon, a script tag, or a document whose
 * language is chosen by its caller.
 */
const NO_COPY = new Set([
  "Badge.tsx",
  "BaseTiles.tsx",
  "Button.tsx",
  "Logo.tsx",
  "OrganizationSchema.tsx",
  "ServiceWorkerRegister.tsx",
  "motion.tsx",
  "portalKit.tsx",
  "ConfirmMap.tsx",
  "WatchMap.tsx",
  // The PDFs take their language as an argument from whoever renders them.
  "receiptPdf.tsx",
  "orderPdf.tsx",
  "welcomeCard.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * A line is fine if the language is decided on it, or the string came from
 * somewhere that already decided: a prop, a dictionary lookup, a shared map.
 */
const TRANSLATED = /\bfr\s*\?|\bt\(|\btranslate\(|\btr\(|locale\s*===|\ben:\s*["'`]|\{fr\s*\?/;

/**
 * Text between JSX tags: `>Some words here<`, ignoring anything interpolated.
 *
 * The `(?<!=)` matters more than it looks. Without it, a TypeScript arrow type
 * of the shape `=> void | Promise<void>` reads as a closing bracket followed by
 * prose followed by an opening bracket, and the check reports a language leak
 * in a type annotation nobody will ever see on a screen. A check that cries
 * wolf about types is one people start ignoring about copy, which would cost
 * exactly the thing this file exists to protect.
 */
const JSX_TEXT = /(?<!=)> *([A-Za-zÀ-ÿ][^<>{}\n]{7,}?) *</g;
/** Attributes a person reads or hears. */
const HUMAN_ATTR = /\b(?:placeholder|title|aria-label|alt)=["']([^"']{5,})["']/g;

/** Not prose: class strings, ids, urls, phone masks, and the brand's own name. */
function isProse(value: string): boolean {
  const text = value.trim();
  if (!/[a-zA-ZÀ-ÿ]/.test(text)) return false;
  // A number mask reads the same in both languages — "+237 6XX XXX XXX" is not
  // a sentence, and neither is a price or a URL.
  if (/^(https?:|\/|#|\+|\d)/.test(text)) return false;
  if (/^[A-Z0-9_.-]+$/.test(text)) return false;
  // Punctuation that only appears in code. The JSX-text pattern otherwise picks
  // up fragments of generics and calls, which are noise nobody will read past.
  if (/[<>{}()[\]=;]/.test(text)) return false;
  // Needs at least two words to be a sentence somebody reads.
  if (!/\s/.test(text)) return false;
  if (/^(Urban Night Lift|MTN Mobile Money|Orange Money)/.test(text)) return false;
  return true;
}

console.log("\nNothing a customer reads is written in one language only");

const offenders: string[] = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const name = file.split("/").pop()!;
    if (NO_COPY.has(name)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A comment is for us, not for a customer.
      const code = line.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
      if (TRANSLATED.test(code)) return;

      const hits: string[] = [];
      for (const m of code.matchAll(JSX_TEXT)) hits.push(m[1]);
      for (const m of code.matchAll(HUMAN_ATTR)) hits.push(m[1]);
      for (const hit of hits) {
        if (isProse(hit)) offenders.push(`${file}:${i + 1}  ${hit.trim().slice(0, 60)}`);
      }
    });
  }
}

check(
  `${offenders.length === 0 ? "every" : "not every"} customer-facing string picks a language`,
  offenders.length === 0,
  offenders.slice(0, 20).join("\n       ") +
    (offenders.length > 20 ? `\n       …and ${offenders.length - 20} more` : "")
);

console.log(
  `\n${failures === 0 ? "Both languages, everywhere a customer looks." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
