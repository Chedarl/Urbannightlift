/**
 * Proves the food catalogue path keeps the pin it was handed.
 *
 * ## The defect this exists because of
 *
 * `FoodForm` built its order draft like this:
 *
 * ```ts
 * pickupLat:    browsing ? null : (pickup?.latitude  ?? null),
 * pickupLng:    browsing ? null : (pickup?.longitude ?? null),
 * pickupZoneId: browsing ? ""   : (pickup?.zoneId    ?? ""),
 * ```
 *
 * `browsing` is true exactly when the customer chose a restaurant from our own
 * catalogue — the path this product spent v49 and v50 building, and the one we
 * most want people to use. On that path the pickup coordinates were thrown
 * away, and `quoteDeliveryFee` measures road distance from precisely those two
 * numbers. So the good path was the one priced from a zone guess, while the
 * merchant row it came from had coordinates sitting on it.
 *
 * It was invisible from every direction. The types were satisfied — `null` is a
 * legal `number | null`. Lint saw nothing. Sixty-four suites saw nothing. The
 * customer saw a plausible fare and the rider got a restaurant name.
 *
 * Underneath it was a second defect with the same shape: `/api/food/browse`
 * never *sent* the coordinates, so even a corrected form had nothing to carry.
 *
 * ## What is checked, and why it is checked this way
 *
 * The source assertions below would pass against a form that carried the pin
 * and then priced it wrongly, so they are not the proof. The proof is the
 * arithmetic: the same conversion the screen does, through the same pricing
 * function the server charges with, showing that a pinned merchant produces a
 * measured fare and an unpinned one produces an estimate. If those two ever
 * return the same thing, the pin has stopped mattering and this file should
 * fail before a customer finds out.
 *
 * Run: npx tsx scripts/verify-pickup-pin.ts
 */

import fs from "node:fs";
import path from "node:path";

import { merchantToLocation, type ZoneData } from "../src/lib/locations/fromMerchant";
import { quoteDeliveryFee, distanceKm } from "../src/lib/orders/pricing";
import { DEFAULT_FARE } from "../src/lib/orders/fare";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/**
 * Comments stripped before matching.
 *
 * This project has now caught a check passing because it matched the prose
 * explaining the rule six separate times — including in the docstring above,
 * which quotes the exact broken code this file forbids.
 */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FORM = "src/components/customer/order/forms/FoodForm.tsx";
const BROWSE = "src/app/api/food/browse/route.ts";

/*
 * Two real points in Yaoundé, roughly 4 km apart: a restaurant off Avenue
 * Kennedy in the centre and a flat in Biyem-Assi. Both ends are in the same
 * zone, which is the case that makes the defect worst — a zone-only price has
 * nothing at all to distinguish this trip from a 400 m one.
 */
const RESTAURANT = { lat: 3.8667, lng: 11.5167 };
const HOME = { lat: 3.8345, lng: 11.4889 };

const ZONES: ZoneData[] = [
  { id: "z-centre", zoneName: "Centre-Ville", tier: "GREEN", feeXaf: 1000, centroidLat: 3.868, centroidLng: 11.515 },
  { id: "z-biyem", zoneName: "Biyem-Assi", tier: "GREEN", feeXaf: 1000, centroidLat: 3.835, centroidLng: 11.489 },
];
const PRICING = { id: "z", feeXaf: 1000, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: "GREEN" as const };

console.log("A restaurant chosen from the catalogue arrives with its pin");
{
  const pickup = merchantToLocation(
    {
      merchantName: "Chez Wou",
      neighbourhood: "Centre-Ville",
      address: "Avenue Kennedy",
      landmark: "Face Poste Centrale",
      latitude: RESTAURANT.lat,
      longitude: RESTAURANT.lng,
      phone: "+237 6 90 00 00 00",
    },
    ZONES
  );

  check("the converter returns the merchant's own coordinates", pickup.latitude === RESTAURANT.lat && pickup.longitude === RESTAURANT.lng);
  check("and resolves a zone from them rather than from anything stored", pickup.zoneId === "z-centre", `got ${pickup.zoneId}`);
  check("and marks where it came from", pickup.source === "merchant");
}

console.log("\nThe pin is what makes the fare a measurement instead of a guess");
{
  const km = distanceKm(RESTAURANT.lat, RESTAURANT.lng, HOME.lat, HOME.lng);
  check("the test trip is a real distance, not two points on top of each other", km > 3 && km < 6, `${km.toFixed(2)} km`);

  const withPin = quoteDeliveryFee(PRICING, PRICING, {
    pickup: RESTAURANT,
    delivery: HOME,
    rules: DEFAULT_FARE,
    errand: true,
    hour: 21,
  });
  const nulled = quoteDeliveryFee(PRICING, PRICING, {
    // Exactly what the broken form sent: the delivery end pinned, the pickup
    // end discarded because the customer used the catalogue.
    pickup: null,
    delivery: HOME,
    rules: DEFAULT_FARE,
    errand: true,
    hour: 21,
  });

  check("a pinned pickup prices on distance", withPin != null && withPin.estimated === false);
  check("a discarded pickup falls back to an estimate", nulled != null && nulled.estimated === true);
  check(
    "and the two are not the same number, which is the whole point",
    withPin != null && nulled != null && withPin.totalXaf !== nulled.totalXaf,
    `pinned ${withPin?.totalXaf} vs estimated ${nulled?.totalXaf} — if these ever match, the pin has stopped mattering and this check has stopped meaning anything`
  );
}

console.log("\nThe form no longer throws the pin away");
{
  const form = code(FORM);

  check(
    "the draft does not null the pickup coordinates on the browse path",
    !/pickupLat:\s*browsing\s*\?/.test(form) && !/pickupLng:\s*browsing\s*\?/.test(form),
    "this is the defect verbatim — `browsing ? null : …` on the two fields the fee is measured from"
  );
  check(
    "nor blank the pickup zone",
    !/pickupZoneId:\s*browsing\s*\?/.test(form)
  );
  check(
    "it reuses the one merchant-to-location converter",
    /merchantToLocation/.test(form),
    "a second copy is how a restaurant found by browsing and the same restaurant found by searching start quoting different fees"
  );
  check(
    "and the live fare on screen is quoted from the same pin the draft carries",
    /quote\(\{\s*pickup:\s*effectivePickup/.test(form),
    "quoting one pickup and submitting another is how a screen and a receipt disagree"
  );
}

console.log("\nThe coordinates actually leave the server");
{
  const browse = code(BROWSE);

  check("the browse query selects the merchant's coordinates", /latitude:\s*true/.test(browse) && /longitude:\s*true/.test(browse));
  check("and the response carries them", /latitude:\s*m\.latitude/.test(browse) && /longitude:\s*m\.longitude/.test(browse));
  check(
    "the catalogue still lists only verified merchants",
    /verified:\s*true/.test(browse),
    "the pin is worth nothing if the business on the end of it was never confirmed to exist"
  );
}

console.log(
  `\n${failures === 0 ? "The good path is priced from where the rider is actually going." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
