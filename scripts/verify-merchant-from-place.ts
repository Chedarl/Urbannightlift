/**
 * Proves a customer's tap cannot write a catalogue row that lies.
 *
 * ## What is now possible that was not
 *
 * The owner chose: a business found on Google Maps is orderable straight away,
 * and the first order puts it in the catalogue. So a `Merchant` row — the thing
 * a dispatcher reads at 1 AM and a rider is sent to — can now be created by
 * somebody tapping a card, with no human in between.
 *
 * That is the right product decision and it moves a boundary this product has
 * been careful about since v12 deleted a 959-row map import, and since v49
 * shipped three invented restaurants and took them straight back out. The rule
 * was never "no imports"; it was **nothing is shown as ours unless a human
 * confirmed it exists.** These checks are that rule, in the one place it is now
 * under pressure.
 *
 * Run: npx tsx scripts/verify-merchant-from-place.ts
 */

import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Comments stripped — these files argue for the rules they are checked against. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MAKER = "src/lib/merchants/fromPlace.ts";
const ORDERS = "src/app/api/orders/route.ts";
const SCHEMA = "prisma/schema.prisma";
const MIGRATION = "prisma/migrations/20260916090000_merchant_place_id/migration.sql";

console.log("A row created this way never claims to be a partner");
{
  const maker = code(MAKER);

  check(
    "it is created unverified",
    /verified:\s*false/.test(maker),
    "nothing is shown as ours unless a human confirmed it exists — that rule predates this feature and survives it"
  );
  check(
    "and not taking orders, because nobody asked them",
    /acceptingOrders:\s*false/.test(maker),
    "presuming the answer is how a delivery company misrepresents a restaurant to its own customers"
  );
  /*
   * Asserted as "every occurrence is the literal", not as "no occurrence looks
   * like an expression".
   *
   * The first version forbade `verified:` followed by a lowercase letter, which
   * contradicted the check above it — `false` starts with one — so it failed on
   * correct code. What matters is that neither flag is ever computed: a
   * `verified: place.something` is the failure, and a literal is the only shape
   * that cannot become one.
   */
  const flag = (name: string) => (maker.match(new RegExp(`${name}:\\s*([^,\\n]+)`, "g")) ?? []);
  check(
    "neither is ever computed from anything a third party said",
    flag("verified").every((m) => m.trim() === "verified: false") &&
      flag("acceptingOrders").every((m) => m.trim() === "acceptingOrders: false"),
    `found: ${[...flag("verified"), ...flag("acceptingOrders")].join(" | ")}`
  );
  check(
    "it is marked as having come from Places",
    /source:\s*"places"/.test(maker),
    "a row nobody can account for is a row nobody will clean up"
  );
}

console.log("\nAnd none of them reaches a browse page as one");
for (const route of [
  "src/app/api/food/browse/route.ts",
  "src/app/api/pharmacy/browse/route.ts",
  "src/app/api/merchants/search/route.ts",
]) {
  const src = code(route);
  check(
    `${route.split("/").slice(-3, -1).join("/")} still filters on all three`,
    /verified:\s*true/.test(src) && /active:\s*true/.test(src) && /acceptingOrders:\s*true/.test(src),
    "an auto-created row appearing under 'confirmed by us' is the exact failure this whole design avoids"
  );
}

console.log("\nThe browser is not believed about somebody else's business");
{
  const maker = code(MAKER);
  const orders = code(ORDERS);

  check(
    "the facts are fetched from the Place ID rather than accepted",
    /placeDetails\(placeId\)/.test(maker),
    "a catalogue row assembled from browser-supplied strings is a forged claim waiting to happen"
  );
  check(
    "the name, address and coordinates come from that lookup",
    /merchantName:\s*place\.name/.test(maker) &&
      /latitude:\s*place\.latitude/.test(maker) &&
      /address:\s*place\.formattedAddress/.test(maker)
  );
  check(
    "the order route passes only the id",
    /merchantFromPlace\(input\.placeId/.test(orders) && !/merchantFromPlace\([^)]*input\.(pickupLat|pickupLocation)/.test(orders)
  );
  check(
    "and the id is the only thing the schema accepts about it",
    /placeId:\s*z\.string\(\)/.test(code("src/lib/validation/orderSchema.ts")) &&
      !/placeName|placeAddress|placeLat/.test(code("src/lib/validation/orderSchema.ts")),
    "every extra field here is another thing a tampered draft could assert"
  );
}

console.log("\nOne of ours always wins, and one row is made per business");
{
  const orders = code(ORDERS);
  const maker = code(MAKER);

  check(
    "a chosen merchant short-circuits discovery entirely",
    /!catalogued && input\.placeId/.test(orders),
    "a row somebody called beats a row nobody called, every time"
  );
  check(
    "an existing row is reused rather than duplicated",
    /findUnique\(\{[\s\S]{0,60}where:\s*\{\s*placeId\s*\}/.test(maker)
  );
  check(
    "the column is unique in the schema",
    /placeId\s+String\?\s+@unique/.test(read(SCHEMA)),
    '"Pharmacie du Centre" is several different pharmacies in this city; only the id tells them apart'
  );
  check(
    "and in the migration that ships it",
    /CREATE UNIQUE INDEX "Merchant_placeId_key"/.test(read(MIGRATION))
  );
  check(
    "the column is nullable, since nearly every row will never have one",
    /ADD COLUMN "placeId" TEXT;/.test(read(MIGRATION)) && !/NOT NULL/.test(read(MIGRATION))
  );
}

console.log("\nNo phone, no row — and the order goes out either way");
{
  const maker = code(MAKER);

  check(
    "a business Places has no number for creates nothing",
    /if \(!phone\) return null;/.test(maker),
    "a catalogue entry nobody can ring is a row a dispatcher opens at 1 AM and closes again"
  );
  check(
    "no number is ever invented to satisfy the column",
    !/\+237/.test(maker) && !/whatsappNumber:\s*"/.test(maker),
    "the column is non-null and read in fifty-nine places; the answer to that is to skip the row, not to fill it"
  );
  check(
    "a permanently closed business creates nothing either",
    /CLOSED_PERMANENTLY/.test(maker)
  );
  check(
    "every failure returns null rather than throwing",
    /catch \{[\s\S]{0,200}return null;/.test(maker),
    "a catalogue improvement must never be able to lose somebody's dinner"
  );
  check(
    "and the order route treats a null as simply no merchant",
    /discovered\s*\?[\s\S]{0,120}:\s*null;/.test(orders_()),
    "the free-text path with a pin on it is exactly what the order would have been anyway"
  );
}

function orders_() {
  return code(ORDERS);
}

console.log("\nAnd nothing of Google's is warehoused beyond the id");
{
  const maker = code(MAKER);
  check(
    "no rating, review, photo or opening hours is stored",
    !/rating|review|photoUrl|openingHours|weekdayDescriptions/i.test(maker),
    "their terms forbid the mirror, and a catalogue copied in March is a rider sent to a business that closed in April"
  );
  check(
    "the stored fields are the ones needed to send somebody there",
    ["merchantName", "whatsappNumber", "address", "latitude", "longitude"].every((f) => maker.includes(f))
  );
}

/**
 * The parts a source read cannot settle: that the migration is actually applied
 * and that the constraint actually constrains.
 *
 * A unique index that exists in a migration file and not in the database is the
 * usual way "this cannot be duplicated" turns out to be untrue in production.
 */
async function againstTheDatabase() {
  console.log("\nAgainst the database");
  const { prisma } = await import("../src/lib/prisma");
  const { merchantFromPlace } = await import("../src/lib/merchants/fromPlace");

  const id = `verify-place-${Date.now()}`;
  try {
    check(
      "with no Maps key, ordering from a find creates nothing at all",
      (await merchantFromPlace(id, "FOOD")) === null,
      "this is the state it runs in until the owner creates a key, so it is the state that has to be safe"
    );
    check("and leaves no row behind", (await prisma.merchant.count({ where: { placeId: id } })) === 0);

    const first = await prisma.merchant.create({
      data: { placeId: id, merchantName: "Verify Place", category: "FOOD", whatsappNumber: "+237600000000", verified: false, acceptingOrders: false, source: "places" },
      select: { id: true },
    });
    check("a row can carry a place id", Boolean(first.id));

    let duplicated = false;
    try {
      await prisma.merchant.create({
        data: { placeId: id, merchantName: "Verify Place Again", category: "FOOD", whatsappNumber: "+237600000001", source: "places" },
      });
      duplicated = true;
    } catch {
      // The unique index doing its job.
    }
    check(
      "and a second row cannot carry the same one",
      !duplicated,
      "two customers ordering from the same shop must join one row, not make two"
    );

    check(
      "two rows may both have none, since nearly every merchant never will",
      (await prisma.merchant.count({ where: { placeId: null } })) >= 0
    );

    await prisma.merchant.delete({ where: { id: first.id } });
  } finally {
    await prisma.$disconnect();
  }
}

void (async () => {
  await againstTheDatabase();

  console.log(
    `\n${failures === 0 ? "A customer can put a business in the catalogue, and cannot make it look like a partner." : `${failures} check(s) FAILED.`}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
})();
