/**
 * Proves the merchant gatherer stays inside what we are allowed to take.
 *
 * ## Why a catalogue needs a suite at all
 *
 * Because the two ways it can go wrong are both silent and both expensive.
 *
 * **Taking what is not ours.** Places photos carry attribution and caching
 * conditions that a seeded JSON file cannot honour, and a restaurant's logo is
 * its trademark — putting Tchop et Yamo's mark on our order page asserts a
 * relationship we do not have. A field mask is one word away from including
 * photos, and nothing would break; we would simply be republishing somebody
 * else's marks until they noticed.
 *
 * **Putting unverified businesses in front of customers.** "We deliver from X"
 * is a claim about somebody else's business. v49 shipped three *invented*
 * restaurants and had to take them straight back out. A gatherer wired to the
 * database would make that mistake at scale and at speed.
 *
 * Neither is a bug a compiler or a rendering test can see.
 *
 * Run: npx tsx scripts/verify-catalogue.ts
 */

import fs from "node:fs";
import path from "node:path";

import { searchBusinesses, hasPlacesKey } from "../src/lib/maps/places";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Comments stripped — these files explain the rules they are checked against. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PLACES = "src/lib/maps/places.ts";
const GATHERER = "scripts/gather-merchants.ts";

console.log("We take facts, and not the things that are not facts");
{
  const places = code(PLACES);

  check(
    "the field mask never asks for photos",
    !/places\.photos/.test(places),
    "a photo SKU is both the expensive one and the one with conditions we cannot honour in a JSON file"
  );
  check(
    "nor for reviews or editorial summaries",
    !/places\.reviews|editorialSummary|generativeSummary/.test(places),
    "somebody else's words about a business are their words"
  );
  check(
    "and the returned shape has nowhere to put an image",
    !/photo|logo|imageUrl/i.test(places.slice(places.indexOf("interface PlaceBusiness"), places.indexOf("export async function searchBusinesses"))),
    "a field that exists will eventually be filled"
  );

  // What it *does* take, each a fact about a business rather than a work.
  for (const field of ["places.id", "places.displayName", "places.formattedAddress", "places.location"]) {
    check(`it does ask for ${field}`, places.includes(field));
  }
  check(
    "the mask is explicit rather than a wildcard",
    !/"X-Goog-FieldMask":\s*"\*"|FieldMask.*\*/.test(places),
    "asking for everything is how a catalogue run becomes an invoice"
  );
}

console.log("\nThe gatherer cannot put a business in front of a customer by itself");
{
  const gatherer = code(GATHERER);

  check(
    "it never imports Prisma",
    !/from ["']@?[./]*.*prisma/i.test(gatherer) && !/PrismaClient/.test(gatherer),
    "listing a business is a claim about somebody else's shop; a person checks it first"
  );
  check(
    "it writes a file and says so",
    /writeFileSync/.test(gatherer) && /Nothing has been written to the database/.test(read(GATHERER)),
    "the output has to be obviously a draft, or it will be treated as done"
  );
  check(
    "it refuses to overwrite an earlier run",
    /existsSync\(outPath\)/.test(gatherer),
    "merging two gathers is a decision, not a default"
  );
  check(
    "it refuses to run without a key rather than writing an empty catalogue",
    /hasPlacesKey\(\)/.test(gatherer) && /process\.exitCode = 1/.test(gatherer),
    "an empty file looks like a result"
  );
  check(
    "it can be costed before it is run",
    /--dry/.test(gatherer),
    "Places bills per search; a wrong query pattern is expensive before it is wrong"
  );
  check(
    "it drops permanently closed businesses",
    /CLOSED_PERMANENTLY/.test(gatherer),
    "not a judgement call, and it wastes the attention the review is for"
  );
  check(
    "it de-duplicates by place id, not by name",
    /byPlaceId/.test(gatherer) && /placeId/.test(gatherer),
    '"Pharmacie du Centre" is several different pharmacies in this city'
  );
}

async function degradesWithoutAKey() {
  console.log("\nIt degrades rather than throwing");
  // No key configured is the normal case here, and is the path most likely to
  // be hit by somebody running this for the first time.
  const empty = await searchBusinesses("restaurant Bastos");
  check(
    "a search with no key returns empty rather than throwing",
    Array.isArray(empty) && empty.length === 0,
    "a gatherer that dies halfway leaves a half-written file"
  );
  check("and the key check agrees with itself", typeof hasPlacesKey() === "boolean");
}

function serverOnlySplitIsDeliberate() {
  console.log("\nThe split from the server-only module is deliberate");
  check(
    `${PLACES} is not marked server-only`,
    !/["']server-only["']/.test(code(PLACES)),
    "its only caller is a CLI script, which server-only cannot tell from a browser bundle"
  );
  check(
    "and it reads no NEXT_PUBLIC key, so there is nothing to leak without the guard",
    !/NEXT_PUBLIC/.test(code(PLACES)),
    "the key resolves to undefined in a browser and every function returns empty"
  );
  check(
    "while google.ts, which the request path uses, keeps the guard",
    /^import ["']server-only["']/m.test(read("src/lib/maps/google.ts"))
  );
}

void (async () => {
  await degradesWithoutAKey();
  serverOnlySplitIsDeliberate();

  console.log(
    `\n${failures === 0 ? "The catalogue takes facts, and a person decides what a customer sees." : `${failures} check(s) FAILED.`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
})();
