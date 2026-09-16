/**
 * Proves no server module calls a function that lives on the client.
 *
 * ## The defect this exists because of
 *
 * `tagsFromProducts` was defined in `BusinessCard.tsx`, which carries
 * `"use client"`. `featuredMerchants` — a `server-only` module feeding the hub —
 * imported and called it. Next replaces such an import with a *client
 * reference*, so the call threw at request time:
 *
 *     Attempted to call tagsFromProducts() from the server but
 *     tagsFromProducts is on the client.
 *
 * **`/order` returned 500 on every request.** `tsc --noEmit` passed.
 * `next build` succeeded and pre-rendered 45 pages. `eslint` passed. Seventy
 * suites passed. The page simply did not load, and the only way it was found
 * was opening it.
 *
 * That is the shape worth guarding: the boundary is a build-time convention,
 * not a type, so nothing in the ordinary toolchain has an opinion about it.
 *
 * ## What is checked
 *
 * Every module under `src/lib` that is marked `server-only`, plus every server
 * component under `src/app`, must not import a **value** from a `"use client"`
 * module. Types are fine — they are erased — which is why `featured.ts` may
 * still import `BusinessCardData` from the card it feeds.
 *
 * Run: npx tsx scripts/verify-client-boundary.ts
 */

import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const read = (abs: string) => fs.readFileSync(abs, "utf8");

/** Every .ts/.tsx under src, as repo-relative paths. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(e.name)) out.push(path.relative(ROOT, abs));
  }
  return out;
}

const files = walk(SRC);

/** A module Next will compile into the client bundle. */
const isClient = (rel: string) => /^\s*["']use client["']/m.test(read(path.join(ROOT, rel)));
/** A module that may only ever run on the server. */
const isServerOnly = (rel: string) => /^\s*import\s+["']server-only["']/m.test(read(path.join(ROOT, rel)));

/**
 * Value imports only.
 *
 * `import type { X }` and `import { type X }` are erased before Next sees them,
 * so they cross the boundary harmlessly — and forbidding them would mean a
 * server query could not name the shape of the thing it is building.
 */
function valueImports(src: string): { from: string; names: string }[] {
  const out: { from: string; names: string }[] = [];
  const re = /import\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) continue; // `import type { … } from`
    const names = m[2].trim();
    // `import { type A, type B } from` — every named binding erased.
    const inner = names.match(/^\{([\s\S]*)\}$/);
    if (inner && inner[1].split(",").every((n) => !n.trim() || /^type\s/.test(n.trim()))) continue;
    out.push({ from: m[3], names });
  }
  return out;
}

/** `@/x` and relative specifiers to a real file under src. */
function resolve(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(ROOT, path.dirname(fromRel), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c)) return path.relative(ROOT, c);
  }
  return null;
}

const clientModules = new Set(files.filter(isClient));

/**
 * The React Server Component graph — and only that.
 *
 * Route handlers are excluded on evidence rather than on principle. Two API
 * routes call `translate()`, imported from the `"use client"` i18n module, and
 * both work: the built `api/assistant/route.js` pulls in the chunk holding the
 * *real* implementation and the real dictionary, with no client reference
 * anywhere in it. Next applies that transform to the RSC graph, which a route
 * handler is not part of.
 *
 * `server-only` libraries stay in scope whatever imports them, because one of
 * them reaching into a client module is exactly how `/order` went down.
 */
const serverModules = files.filter(
  (f) =>
    isServerOnly(f) ||
    (/^src\/app\//.test(f) && !isClient(f) && !/\/route\.tsx?$/.test(f))
);

console.log(`Checking ${serverModules.length} server modules against ${clientModules.size} client ones`);

/**
 * The named bindings of an import clause, ignoring the default and namespace.
 */
function bindings(names: string): string[] {
  const inner = names.match(/\{([\s\S]*)\}/);
  if (!inner) return [];
  return inner[1]
    .split(",")
    .map((n) => n.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop()!.trim())
    .filter(Boolean);
}

const offences: string[] = [];
for (const f of serverModules) {
  const src = read(path.join(ROOT, f));
  for (const imp of valueImports(src)) {
    const target = resolve(f, imp.from);
    if (!target || !clientModules.has(target)) continue;
    /*
      Called, not merely imported.

      Next replaces a client module's *callable* exports with references that
      throw when invoked — that is what took `/order` down. A primitive passes
      through untouched: `LOCALE_COOKIE` is a string, and the built server chunk
      contains it inline as `g="unl_locale"`, which is why `layout.tsx` has
      imported it across this boundary for many versions without trouble.

      A component rendered as `<Thing />` is also fine and is the whole point of
      the boundary, so only a bare call counts.
    */
    for (const name of bindings(imp.names)) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(src)) {
        offences.push(`${f}\n         calls ${name}(), imported from ${target} ("use client")`);
      }
    }
  }
}

console.log("\nNo server module calls into the client bundle");
check(
  "every function a server module calls is one that exists on the server",
  offences.length === 0,
  offences.join("\n       ") ||
    "Next replaces such an import with a client reference and the call throws at request time — which is how /order returned 500 while the build was green"
);

console.log("\nThe check knows what it is looking for");
{
  // If it could not, `featured.ts` importing `BusinessCardData` would be an
  // offence and this suite would be unusable — so it is worth proving.
  const sample = `
    import type { A } from "@/x";
    import { type B } from "@/y";
    import { c } from "@/z";
  `;
  const got = valueImports(sample).map((i) => i.from);
  check("`import type` is ignored", !got.includes("@/x"));
  check("an all-type named import is ignored", !got.includes("@/y"));
  check("a real value import is caught", got.includes("@/z"));
  check(
    "a constant is not mistaken for a function",
    !/\bLOCALE_COOKIE\s*\(/.test(read(path.join(ROOT, "src/lib/i18n/server.ts"))),
    "the rule is about calling, not importing — a string crosses the boundary intact"
  );
}

console.log("\nThe helper the defect was about is on neither side's hook");
{
  const tags = "src/lib/merchants/tags.ts";
  check("it exists as a plain module", fs.existsSync(path.join(ROOT, tags)));
  check("with no client directive", !isClient(tags));
  check(
    "and no server-only guard either",
    !isServerOnly(tags),
    "both the hub's query and the card render it, so it has to be allowed in both bundles"
  );
  check(
    "the card does not re-export it",
    !/export \{[^}]*tagsFromProducts/.test(read(path.join(ROOT, "src/components/customer/business/BusinessCard.tsx"))),
    "a re-export from a client module rebuilds the same trap for the next caller"
  );
}

console.log(
  `\n${failures === 0 ? "Nothing on the server reaches for something that only exists in the browser." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
