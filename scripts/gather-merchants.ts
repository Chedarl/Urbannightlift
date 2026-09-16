/**
 * Gathers real Yaoundé restaurants and pharmacies into a file a person reviews.
 *
 * ## Why this exists
 *
 * The catalogue is empty. `Merchant.logoUrl` is null everywhere, there are no
 * seeded businesses, and `artworkFor` draws generated tiles because there are
 * no photographs. The order screens were rebuilt twice and will not look
 * finished until there is something real behind them — v49 shipped three
 * *invented* restaurants and had to take them straight back out, which is the
 * mistake this is the alternative to.
 *
 * ## What it will not do
 *
 * **It never writes to the database.** Output is a JSON file for a person to
 * read. A gatherer wired straight to `Merchant` would put businesses in front
 * of customers that nobody at Urban Night Lift has checked exist, is still
 * trading, or would want the orders — and "we deliver from X" is a claim about
 * somebody else's business.
 *
 * **It never collects photos or logos.** See `PlaceBusiness` in
 * `lib/maps/google.ts`: Places photos carry attribution and caching conditions
 * a seeded file cannot honour, and a logo is a trademark. Facts about a
 * business are licensed; its mark is not. Merchants upload their own logo
 * through the onboarding that already exists.
 *
 * **It never overwrites.** A second run against a different set of queries
 * writes a new file; merging is a decision, not a default.
 *
 * ## Cost
 *
 * Places text search is billable per request, priced by the field mask. The
 * default sweep is 56 searches — twenty-nine quartiers against two subjects —
 * and `--deep` is 216, one per landmark. Run `--dry` first to see exactly how
 * many it would make, and `--queries` to narrow it, before pointing it at a
 * live key.
 *
 * Run:
 *   npx tsx scripts/gather-merchants.ts --dry
 *   npx tsx scripts/gather-merchants.ts --dry --deep
 *   npx tsx scripts/gather-merchants.ts --queries "pharmacie Bastos"
 *   npx tsx scripts/gather-merchants.ts
 */

import fs from "node:fs";
import path from "node:path";

import { searchBusinesses, hasPlacesKey, type PlaceBusiness } from "../src/lib/maps/places";
import { quartierNames, landmarkSeeds } from "../src/lib/geo/quartiers";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "prisma/data");

/**
 * What to search for, and what each result should be filed as.
 *
 * Quartier by quartier rather than one city-wide search, because Places caps a
 * text search at 20 results and "restaurant Yaoundé" would return twenty places
 * in the centre and nothing in Essos.
 *
 * The eight names that used to be hardcoded here are now twenty-nine, from
 * `src/lib/geo/quartiers.ts` — the same table the address field suggests
 * landmarks from, so the places we search and the places we can describe stay
 * the same set. `--deep` searches by landmark instead, which is roughly four
 * times the searches and finds the bar on the junction rather than whatever
 * ranks highest across a whole quartier.
 */

const SUBJECTS: { term: string; category: "FOOD" | "PHARMACY" }[] = [
  { term: "restaurant", category: "FOOD" },
  { term: "pharmacie", category: "PHARMACY" },
];

interface GatheredMerchant extends PlaceBusiness {
  category: "FOOD" | "PHARMACY";
  /** The search that found it, so a surprising row can be traced. */
  foundBy: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const deep = args.includes("--deep");
  const qIndex = args.indexOf("--queries");
  const explicit = qIndex >= 0 ? args[qIndex + 1]?.split(",").map((s) => s.trim()).filter(Boolean) : null;
  return { dry, deep, explicit };
}

function plannedQueries(explicit: string[] | null, deep = false): { query: string; category: "FOOD" | "PHARMACY" }[] {
  if (explicit?.length) {
    // An explicit query is filed by which subject word it contains; anything
    // unrecognised is FOOD, which is the one a person will notice is wrong.
    return explicit.map((query) => ({
      query,
      category: /pharmac/i.test(query) ? ("PHARMACY" as const) : ("FOOD" as const),
    }));
  }
  const places = deep ? landmarkSeeds() : quartierNames();
  return places.flatMap((q) =>
    SUBJECTS.map((s) => ({ query: `${s.term} ${q} Yaoundé`, category: s.category }))
  );
}

async function main() {
  const { dry, deep, explicit } = parseArgs();
  const queries = plannedQueries(explicit, deep);

  console.log(`${queries.length} search(es) planned:\n`);
  for (const q of queries) console.log(`  ${q.category.padEnd(8)} ${q.query}`);

  if (dry) {
    console.log(
      `\nDry run — nothing was requested and nothing was billed.\n` +
        `Drop --dry to run these ${queries.length} searches for real.\n`
    );
    return;
  }

  if (!hasPlacesKey()) {
    console.error(
      "\nNo Places key. Set GOOGLE_MAPS_SERVER_KEY (or GOOGLE_MAPS_API_KEY) with\n" +
        "Places (New) enabled and billing on — see docs/MAPS-SETUP.md.\n" +
        "Refusing to run rather than writing an empty catalogue that looks like a result.\n"
    );
    process.exitCode = 1;
    return;
  }

  const byPlaceId = new Map<string, GatheredMerchant>();
  let failed = 0;

  for (const { query, category } of queries) {
    const hits = await searchBusinesses(query);
    if (hits.length === 0) failed += 1;
    console.log(`  ${String(hits.length).padStart(2)} · ${query}`);

    for (const hit of hits) {
      /*
        A place found by two quartier searches is one business, not two. Keyed
        by `placeId` rather than by name — "Pharmacie du Centre" is several
        different pharmacies in this city.
      */
      if (!byPlaceId.has(hit.placeId)) {
        byPlaceId.set(hit.placeId, { ...hit, category, foundBy: query });
      }
    }
  }

  const all = [...byPlaceId.values()];
  /*
    Closed businesses are dropped here rather than left for the reviewer. A
    permanently closed restaurant in a delivery catalogue is not a judgement
    call, and leaving it in wastes the attention the review is for.
  */
  const open = all.filter((m) => m.businessStatus !== "CLOSED_PERMANENTLY");
  const dropped = all.length - open.length;

  open.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(OUT_DIR, `merchants.yaounde.${stamp}.json`);
  if (fs.existsSync(outPath)) {
    console.error(`\n${path.relative(ROOT, outPath)} already exists. Move it aside first — merging is a decision.\n`);
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        gatheredAt: new Date().toISOString(),
        source: "Google Places (New) text search",
        note:
          "Facts only — no photos or logos. Review every row before seeding: " +
          "listing a business implies we deliver for them.",
        merchants: open,
      },
      null,
      2
    )
  );

  console.log(
    `\n${open.length} business(es) → ${path.relative(ROOT, outPath)}` +
      `${dropped > 0 ? ` (${dropped} permanently closed, dropped)` : ""}` +
      `${failed > 0 ? `\n${failed} search(es) returned nothing — worth checking the key and the quartier names.` : ""}` +
      `\n\nNothing has been written to the database. Read the file before seeding any of it.\n`
  );
}

void main();
