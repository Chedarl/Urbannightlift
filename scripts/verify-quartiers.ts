/**
 * Proves the quartier table describes Yaoundé and decides nothing.
 *
 * ## What this table is for
 *
 * `LocationField` makes "nearest landmark" a required field for any pin that
 * did not come from our own catalogue, and offered a blank box to fill it with.
 * A grep for landmark suggestions across the repo returned nothing. In a city
 * where the landmark *is* the address, that is the one field we could have
 * helped with and did not.
 *
 * ## The two ways a table like this goes wrong, both quiet
 *
 * **It stops being about Yaoundé.** A transposed pair of coordinates, a sign
 * dropped from a longitude, and `nearestQuartier` starts confidently offering
 * Carrefour Acacias to somebody in the Gulf of Guinea. Nothing throws; the
 * suggestions are simply wrong, and a wrong landmark reads as a confirmed one
 * to the rider who drives to it.
 *
 * **It starts deciding things.** The temptation with 29 coordinates is to load
 * them into `Zone`. `Zone` is the pricing table — hand-set fees, Yaoundé 6
 * GREEN and the rest of the city RED with "owner approval recommended" — so
 * doing that would reprice every address in Yaoundé and hand a green tier to
 * areas the owner marked restricted, without anybody deciding to. This file
 * fails if that import is ever written.
 *
 * Run: npx tsx scripts/verify-quartiers.ts
 */

import fs from "node:fs";
import path from "node:path";

import { QUARTIERS, nearestQuartier, landmarksNear, quartierNames, landmarkSeeds } from "../src/lib/geo/quartiers";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Comments stripped — this module's docstring explains the rule it is checked against. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Yaoundé sits inside this box. Anything outside it is a typo, not a quartier. */
const BOUNDS = { south: 3.75, north: 3.99, west: 11.35, east: 11.65 };

console.log("Every quartier is in Yaoundé");
{
  check("there are enough of them to be worth having", QUARTIERS.length >= 25, `${QUARTIERS.length}`);
  for (const q of QUARTIERS) {
    const inside =
      q.lat >= BOUNDS.south && q.lat <= BOUNDS.north && q.lng >= BOUNDS.west && q.lng <= BOUNDS.east;
    if (!inside) check(`${q.name} is inside the city`, false, `${q.lat}, ${q.lng}`);
  }
  check(
    "all of them are inside the city",
    QUARTIERS.every((q) => q.lat >= BOUNDS.south && q.lat <= BOUNDS.north && q.lng >= BOUNDS.west && q.lng <= BOUNDS.east)
  );
  check(
    "latitude and longitude are not transposed anywhere",
    QUARTIERS.every((q) => q.lat < q.lng),
    "Yaoundé is near 3.8 N, 11.5 E — a row where the first number is the larger one has them the wrong way round"
  );
  check("each names its arrondissement", QUARTIERS.every((q) => /^Yaoundé [1-6]$/.test(q.sector)));
  check("each carries at least three landmarks", QUARTIERS.every((q) => q.landmarks.length >= 3));
  check(
    "no two quartiers share a centre",
    new Set(QUARTIERS.map((q) => `${q.lat},${q.lng}`)).size === QUARTIERS.length
  );
  check(
    "the six arrondissements are all represented",
    new Set(QUARTIERS.map((q) => q.sector)).size === 6,
    "a table that only knows Yaoundé 6 suggests nothing to most of the city"
  );
}

console.log("\nA pin gets the words people standing there would use");
{
  // Carrefour Acacias, Biyem-Assi — the middle of the service area.
  const acacias = nearestQuartier(3.8345, 11.4889);
  check("a Biyem-Assi pin resolves to Biyem-Assi", acacias?.name.startsWith("Biyem-Assi") === true, `${acacias?.name}`);
  check(
    "and is offered that junction by name",
    landmarksNear(3.8345, 11.4889).includes("Carrefour Acacias")
  );

  const mendong = nearestQuartier(3.8211, 11.4784);
  check("a Mendong pin resolves to Mendong", mendong?.name.startsWith("Mendong") === true, `${mendong?.name}`);

  const centre = landmarksNear(3.8667, 11.5167);
  check("a Centre-Ville pin is offered Avenue Kennedy", centre.includes("Avenue Kennedy"), centre.join(" · "));
}

console.log("\nAnd a pin nowhere near the city is offered nothing at all");
{
  // Douala, 200 km away — the case where a nearest-match with no cutoff would
  // confidently hand somebody a junction in a different city.
  check("Douala resolves to no quartier", nearestQuartier(4.0511, 9.7679) === null);
  check("and gets no suggestions", landmarksNear(4.0511, 9.7679).length === 0);
  // 0,0 is the Atlantic off Ghana, which is what an unset pin serialises to.
  check("the null island gets none either", landmarksNear(0, 0).length === 0);
}

console.log("\nThe suggestions are a short, clean row");
{
  const near = landmarksNear(3.8392, 11.4921);
  check("there are some", near.length > 0);
  check("no more than asked for", landmarksNear(3.8392, 11.4921, 4).length <= 4);
  check("and none repeated", new Set(near).size === near.length, near.join(" · "));
  check(
    "a pin between two quartiers can reach both",
    landmarksNear(3.839, 11.486, 12).some((l) => /Acacias|Express/.test(l)) &&
      landmarksNear(3.839, 11.486, 12).some((l) => /Etoug-Ebe|Brique/.test(l)),
    "the person standing there knows which quartier they mean and we do not"
  );
}

console.log("\nThe search seeds are the same places, deduplicated");
{
  check("every quartier contributes a name", quartierNames().length >= 20);
  check(
    "Biyem-Assi is searched once, not twice",
    quartierNames().filter((n) => n === "Biyem-Assi").length === 1,
    "it appears twice in the table — Acacias and Rond-Point Express — and searching it twice doubles the bill for the same twenty results"
  );
  check("the parenthetical hint is not part of the search", quartierNames().every((n) => !n.includes("(")));
  check("the deep sweep searches by landmark", landmarkSeeds().length > quartierNames().length * 3);
  check("and repeats none of them", new Set(landmarkSeeds()).size === landmarkSeeds().length);
  check(
    "the gatherer uses this table rather than its own list",
    /quartierNames|landmarkSeeds/.test(code("scripts/gather-merchants.ts")),
    "the places we search and the places we can describe have to be the same set"
  );
}

console.log("\nIt suggests words. It does not price anything.");
{
  const mod = code("src/lib/geo/quartiers.ts");
  check(
    "the table is never loaded into the pricing zones",
    !/prisma|zone\.create|upsert/i.test(mod),
    "Zone carries hand-set fees and marks everything outside Yaoundé 6 as RED with owner approval recommended; 29 centroids poured into it would reprice the city without anybody deciding to"
  );
  /*
   * Matched as property names, not as words.
   *
   * The first draft of this check was `/feeXaf|tier|serviceStatus/` and it
   * failed on the module it was written for — because "tier" is inside
   * "quartier", which appears in this file's own exports. That is the seventh
   * time in this project a check has matched its own vocabulary. A fee or a
   * tier arriving here would arrive as a field, so a field is what to look for.
   */
  check("it carries no fee, tier or service status", !/\bfeeXaf\b|\btier:|\bserviceStatus\b/.test(mod));
  check(
    "and the seed still writes the zones by hand",
    /zoneName:/.test(read("prisma/seed.ts")) && !/lib\/geo\/quartiers/.test(read("prisma/seed.ts")),
    "the zones are a pricing decision somebody made; they are not derived from a table of place names"
  );
  check(
    "nothing here is presented as verified, rated or photographed",
    !/verified|rating|reviewCount|photoUrl|dataSource/i.test(mod),
    "the prototype this data came from set verified:true on every row and illustrated them with stock photography; none of that came across"
  );
  check(
    "and no phone numbers came across either",
    !/\+237/.test(mod),
    "the same file carried patterned placeholder numbers a dispatcher would have dialled"
  );
}

console.log("\nThe address field actually offers them");
{
  const field = code("src/components/customer/location/LocationField.tsx");
  check("it reads the table", /landmarksNear/.test(field));
  check(
    "from the pin that was dropped, so dragging the map changes them",
    /landmarksNear\(draft\.lat, draft\.lng\)/.test(field)
  );
  check(
    "tapping one fills the box rather than submitting anything",
    /onClick=\{\(\) => setLandmark\(l\)\}/.test(field),
    "a suggestion the customer cannot edit is an assumption about where they are"
  );
  check(
    "and the box is still theirs to type in",
    /value=\{landmark\} onChange=/.test(field)
  );
}

console.log(
  `\n${failures === 0 ? "Twenty-nine quartiers, a hundred-odd landmarks, and not one decision taken on the customer's behalf." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
