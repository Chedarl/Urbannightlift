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

import { searchBusinesses, searchNearby, hasPlacesKey } from "../src/lib/maps/places";

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
const ROUTE = "src/app/api/places/businesses/route.ts";

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
    !/photo|logo|imageUrl/i.test(places.slice(places.indexOf("interface PlaceBusiness"), places.indexOf("interface RawPlace"))),
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

console.log("\nBoth searches take the same facts, through one mask");
{
  const places = code(PLACES);

  /*
   * Counted as definitions, not as headers.
   *
   * The first version of this counted `X-Goog-FieldMask` occurrences and
   * expected one — but the header is sent by both searches, so it failed on
   * correct code. What must be single is the mask itself; what must be true of
   * every header is that it is set to that constant rather than to a list
   * written out beside it.
   */
  check(
    "there is exactly one field mask, defined once",
    (places.match(/const FIELD_MASK\b/g) ?? []).length === 1,
    "two masks is how one of them quietly grows a photos field that the other does not have"
  );
  check(
    "and every request sends that one",
    (places.match(/"X-Goog-FieldMask": FIELD_MASK/g) ?? []).length ===
      (places.match(/X-Goog-FieldMask/g) ?? []).length,
    "a mask written inline at a call site is a mask nobody reviews"
  );
  check(
    "nearby search exists and goes through it",
    /export async function searchNearby/.test(places) && /searchNearby[\s\S]*FIELD_MASK/.test(places)
  );
  check(
    "and through the same Yaoundé bounds",
    (places.match(/YAOUNDE_BOUNDS/g) ?? []).length >= 3,
    "a Douala pharmacy in a Yaoundé catalogue is worse than a short catalogue"
  );
  check(
    "a point outside the city is refused before it is billed",
    places.slice(places.indexOf("export async function searchNearby")).indexOf("YAOUNDE_BOUNDS") <
      places.slice(places.indexOf("export async function searchNearby")).indexOf("postJson"),
    "a request that cannot return anything useful still costs what a request costs"
  );
  check("the radius is clamped", /MAX_RADIUS_M/.test(places) && /Math\.min\(MAX_RADIUS_M/.test(places));
  check("and so is the result count", /clampResults/.test(places));
}

console.log("\nOne door onto discovery, and it is shut to a script");
{
  const route = code(ROUTE);

  check(
    "the route is rate-limited",
    /checkRateLimit\(req,\s*["']placesSearch["']\)/.test(route),
    "unlike the two location routes beside it, which went uncapped because a proxy does not look like a form"
  );
  check(
    "the limit is checked before the key is used",
    route.indexOf("checkRateLimit") < route.indexOf("searchNearby("),
    "counting a call after making it is an audit log, not a limit"
  );
  check(
    "without a key it says so rather than looking empty",
    /"no-key"/.test(route),
    '"nothing is open near you" and "we cannot look right now" are different sentences'
  );
  check(
    "a typed name is a text search, not a radius around a pin",
    /query[\s\S]{0,80}searchBusinesses\(query\)/.test(route),
    "answering a search by name with a radius tells somebody their restaurant does not exist because it is three kilometres away"
  );
  check(
    "permanently closed businesses do not reach a customer",
    /CLOSED_PERMANENTLY/.test(route),
    "sending a rider to a shuttered building at 2 AM is the expensive way to find out"
  );
  check(
    "every merchant category is mapped, by the compiler",
    /satisfies Record<MerchantCategory, string\[\]>/.test(route),
    "a category added to the schema and forgotten here would silently search for nothing"
  );
  check(
    "a pharmacy search includes drugstores",
    /"drugstore"/.test(route),
    "the distinction Google draws does not survive contact with a Yaoundé street, and missing half the pharmacies at 2 AM is the moment this product exists for"
  );
  check(
    "the route never claims a result is a partner",
    !/verified/.test(route) || /not a partner|verified: false/.test(read(ROUTE)),
    "a found business is somewhere a rider can be sent, not somebody we have an arrangement with"
  );
  check(
    "and it is the only route that reaches the Places module",
    placesCallers().length === 1,
    `reached from: ${placesCallers().join(", ") || "nowhere"} — one door is one place to audit`
  );
}

/** Every file under `src/app` that imports the Places module. */
function placesCallers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && /from ["']@\/lib\/maps\/places["']/.test(read(rel))) out.push(rel);
    }
  };
  walk("src/app");
  return out;
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
  check(
    "nearby search degrades the same way",
    (await searchNearby(3.8345, 11.4889, ["restaurant"])).length === 0,
    "this is the state it runs in until the owner creates a key, so it is the state that has to be correct"
  );
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
