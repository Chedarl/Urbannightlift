/**
 * Import Yaoundé restaurants, pharmacies, supermarkets and shops as merchants.
 *
 * Why this exists: customers typed the vendor's name free-hand, so the rider
 * left with a name and no pin and had to ask strangers for a place that might
 * not exist under that spelling. The catalogue fixes that — but only if the
 * data is real. Google Maps listings can't be copied (no key, and their terms
 * forbid storing them), and inventing names and addresses for a live delivery
 * business would put riders in front of places that don't exist. OpenStreetMap
 * is openly licensed (ODbL), so this imports from there.
 *
 * Everything lands UNVERIFIED and therefore invisible to customers. A merchant
 * becomes orderable only after someone has actually called them, from the
 * admin verification queue. Re-running never overwrites an edit a human made:
 * it only fills blanks and adds places that weren't there before.
 *
 *   npx tsx scripts/import-osm-merchants.ts            # from the snapshot
 *   npx tsx scripts/import-osm-merchants.ts --refresh  # re-query Overpass first
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type MerchantCategory } from "@prisma/client";
import { buildSearchKey } from "../src/lib/locations/normalize";
import { distanceKm, nearestZone } from "../src/lib/orders/pricing";

const prisma = new PrismaClient();

const SNAPSHOT = join(process.cwd(), "prisma", "data", "yaounde-places.json");
const CSV_OUT = join(process.cwd(), "prisma", "data", "merchants-to-verify.csv");

/** Yaoundé and its immediate periphery. */
const BBOX = { south: 3.75, west: 11.35, north: 4.02, east: 11.65 };

/**
 * How far from the nearest zone centroid a place may sit and still be worth
 * listing. nearestZone() always returns *something*, so without a cap a
 * restaurant an hour outside town would import as serviceable.
 */
const MAX_ZONE_DISTANCE_KM = 8;

/** Overpass is community-run and often busy; try the mirrors in turn. */
const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const QUERY = `[out:json][timeout:90];(
  nwr["amenity"~"^(restaurant|fast_food|cafe|pharmacy)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  nwr["shop"~"^(supermarket|convenience|grocery|bakery|greengrocer)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);out center tags;`;

interface Place {
  osmId: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

/** OSM's tag vocabulary → our five categories, keeping the raw tag alongside. */
function categorize(tags: Record<string, string>): { category: MerchantCategory; subcategory: string } {
  const amenity = tags.amenity ?? "";
  const shop = tags.shop ?? "";
  if (amenity === "pharmacy") return { category: "PHARMACY", subcategory: "pharmacy" };
  if (["restaurant", "fast_food", "cafe"].includes(amenity)) return { category: "FOOD", subcategory: amenity };
  if (shop === "bakery") return { category: "FOOD", subcategory: "bakery" };
  if (["supermarket", "convenience", "grocery", "greengrocer"].includes(shop)) {
    return { category: "GROCERY", subcategory: shop };
  }
  return { category: "GENERAL_STORE", subcategory: shop || amenity || "shop" };
}

/**
 * Cameroon numbers are written every possible way. Store the digits with the
 * country code so the WhatsApp links and normalizePhone() agree.
 */
function cleanPhone(raw: string | undefined): string {
  if (!raw) return "";
  const first = raw.split(/[;,]/)[0] ?? "";
  const digits = first.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("237")) return `+${digits}`;
  return `+237${digits.replace(/^0+/, "")}`;
}

/**
 * Whether the place is open during our trading night. OSM's opening_hours is a
 * small language of its own; only the unambiguous cases are trusted, and
 * everything else stays false for a human to confirm. Claiming a place is open
 * when it is shut sends a rider on a wasted trip.
 */
function nightAvailability(hours: string | undefined): { nightOpen: boolean; open24h: boolean } {
  if (!hours) return { nightOpen: false, open24h: false };
  const h = hours.toLowerCase();
  if (h.includes("24/7")) return { nightOpen: true, open24h: true };
  // A closing time of 22:00 or later, or one that runs past midnight.
  const closesLate = /(2[0-4]|0[0-4]):[0-5]\d\s*$/m.test(h) || /-\s*(2[2-4]|0[0-4]):/.test(h);
  return { nightOpen: closesLate, open24h: false };
}

async function fetchFromOverpass(): Promise<Place[]> {
  for (const host of OVERPASS_HOSTS) {
    try {
      console.log(`  querying ${host} …`);
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) continue; // busy-server HTML error page
      const data = JSON.parse(text) as {
        elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
      };
      const places: Place[] = [];
      for (const e of data.elements) {
        const tags = e.tags ?? {};
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (!tags.name || lat == null || lng == null) continue;
        places.push({ osmId: `${e.type}/${e.id}`, lat, lng, tags });
      }
      return places;
    } catch {
      // Try the next mirror rather than failing the whole import.
    }
  }
  throw new Error("Overpass unreachable on every mirror — run without --refresh to use the snapshot");
}

function loadSnapshot(): Place[] {
  const raw = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { places: Place[] };
  return raw.places;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const places = refresh ? await fetchFromOverpass() : loadSnapshot();
  console.log(`Loaded ${places.length} named places (${refresh ? "Overpass" : "snapshot"}).`);

  const zones = await prisma.zone.findMany({
    where: { active: true },
    select: { id: true, zoneName: true, tier: true, feeXaf: true, centroidLat: true, centroidLng: true },
  });

  let created = 0;
  let filled = 0;
  let skipped = 0;
  const csv: string[] = ["name,category,neighbourhood,phone,opening_hours,latitude,longitude"];

  for (const p of places) {
    const name = p.tags.name.trim();
    const { category, subcategory } = categorize(p.tags);
    const phone = cleanPhone(p.tags.phone ?? p.tags["contact:phone"]);
    const { nightOpen, open24h } = nightAvailability(p.tags.opening_hours);
    const neighbourhood = p.tags["addr:suburb"] ?? p.tags["addr:street"] ?? null;
    const nearest = nearestZone(p.lat, p.lng, zones);
    const zone =
      nearest && nearest.centroidLat != null && nearest.centroidLng != null &&
      distanceKm(p.lat, p.lng, nearest.centroidLat, nearest.centroidLng) <= MAX_ZONE_DISTANCE_KM
        ? nearest
        : null;
    const aliases = [p.tags["name:fr"], p.tags.brand, p.tags.operator].filter(
      (a): a is string => Boolean(a) && a !== name
    );

    // Match on the map's own id first. Falling back to the name is only safe
    // for rows the owner typed in by hand (no osmId): "Pharmacie du Centre" and
    // "Boulangerie Fontana" each name several genuinely different branches, and
    // collapsing two branches into one row would send riders to the wrong side
    // of town.
    const existing =
      (await prisma.merchant.findUnique({ where: { osmId: p.osmId } })) ??
      (await prisma.merchant.findFirst({
        where: { osmId: null, merchantName: { equals: name, mode: "insensitive" } },
      }));

    if (existing) {
      // Only fill in what is still blank. An address or phone a human corrected
      // outranks anything the map says.
      const patch: Record<string, unknown> = {};
      if (existing.latitude == null) patch.latitude = p.lat;
      if (existing.longitude == null) patch.longitude = p.lng;
      if (!existing.zoneId && zone) patch.zoneId = zone.id;
      if (!existing.phone && phone) patch.phone = phone;
      if (!existing.subcategory) patch.subcategory = subcategory;
      if (!existing.neighbourhood && neighbourhood) patch.neighbourhood = neighbourhood;
      if (!existing.openingHours && p.tags.opening_hours) patch.openingHours = p.tags.opening_hours;
      if (!existing.website && (p.tags.website ?? p.tags["contact:website"])) {
        patch.website = p.tags.website ?? p.tags["contact:website"];
      }
      if (!existing.osmId) patch.osmId = p.osmId;
      if (!existing.searchKey) patch.searchKey = buildSearchKey(name, aliases);

      if (Object.keys(patch).length === 0) {
        skipped += 1;
      } else {
        await prisma.merchant.update({ where: { id: existing.id }, data: patch });
        filled += 1;
      }
      continue;
    }

    await prisma.merchant.create({
      data: {
        merchantName: name,
        category,
        subcategory,
        // A merchant with no number is still worth listing — dispatch can call
        // the customer instead — but it cannot be verified until we have one.
        whatsappNumber: phone,
        phone: phone || null,
        address: [p.tags["addr:street"], neighbourhood, "Yaoundé"].filter(Boolean).join(", "),
        neighbourhood,
        latitude: p.lat,
        longitude: p.lng,
        zoneId: zone?.id ?? null,
        openingHours: p.tags.opening_hours ?? null,
        nightOpen,
        open24h,
        website: p.tags.website ?? p.tags["contact:website"] ?? null,
        aliases,
        searchKey: buildSearchKey(name, aliases),
        source: "osm",
        osmId: p.osmId,
        notes: p.tags.cuisine ? `Cuisine: ${p.tags.cuisine}` : null,
        // Unverified, and invisible to customers until someone calls them.
        verified: false,
        // Anything we cannot place in a zone is too far out to serve tonight.
        active: Boolean(zone),
      },
    });
    created += 1;
    csv.push(
      [name, category, neighbourhood ?? "", phone, p.tags.opening_hours ?? "", p.lat, p.lng]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
  }

  writeFileSync(CSV_OUT, csv.join("\n"));

  const total = await prisma.merchant.count();
  const verified = await prisma.merchant.count({ where: { verified: true, active: true } });
  console.log(`\n  created ${created}, filled gaps on ${filled}, left ${skipped} untouched`);
  console.log(`  ${total} merchants on file, ${verified} verified and visible to customers`);
  console.log(`  call list written to ${CSV_OUT}`);
  console.log(`\n  Nothing new is visible yet — verify merchants in Admin → Merchants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
