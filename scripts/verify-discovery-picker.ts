/**
 * Proves a business found on a map is never dressed up as one we called.
 *
 * ## What changed, and why it needs a suite
 *
 * Until now a customer could reach only a business a human had typed into
 * `Merchant`. That rule — nothing appears unless somebody confirmed it exists —
 * is why the food and pharmacy pages are correct and empty, and it is the only
 * thing standing between this product and the failure it has already had once:
 * v49 shipped three invented restaurants, with fabricated menus, prices and
 * stock photography, live.
 *
 * The picker now shows businesses found on Google Maps beneath our own. That is
 * the right thing to build and it puts the old rule under pressure from a new
 * direction — not by inventing a business, but by making a real one *look*
 * like a partner. Every check below is about that one distinction.
 *
 * The rendering is checked at 390px separately; this checks the things a
 * screenshot cannot see.
 *
 * Run: npx tsx scripts/verify-discovery-picker.ts
 */

import fs from "node:fs";
import path from "node:path";

import { placeToLocation, merchantToLocation, type ZoneData } from "../src/lib/locations/fromMerchant";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Comments stripped — every file here explains the rule it is checked against. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CARD = "src/components/customer/business/BusinessCard.tsx";
const PICKER = "src/components/customer/merchant/MerchantField.tsx";
const ROW = "src/components/customer/food/MerchantRow.tsx";

const ZONES: ZoneData[] = [
  { id: "z-centre", zoneName: "Centre-Ville", tier: "GREEN", feeXaf: 1000, centroidLat: 3.868, centroidLng: 11.515 },
  { id: "z-biyem", zoneName: "Biyem-Assi", tier: "GREEN", feeXaf: 1000, centroidLat: 3.835, centroidLng: 11.489 },
];

console.log("A found business becomes a pickup point, priced like any other");
{
  const found = placeToLocation(
    { name: "Calafatas", formattedAddress: "Avenue Kennedy, Yaoundé", latitude: 3.8667, longitude: 11.5167, nationalPhone: "+237 6 90 00 00 00" },
    ZONES
  );
  const ours = merchantToLocation(
    { merchantName: "Calafatas", neighbourhood: "Centre-Ville", address: "Avenue Kennedy", landmark: null, latitude: 3.8667, longitude: 11.5167, phone: "+237 6 90 00 00 00" },
    ZONES
  );

  check("it carries the real coordinates", found.latitude === 3.8667 && found.longitude === 11.5167);
  check("the zone is resolved from them", found.zoneId === "z-centre");
  check(
    "and it is priced identically to the same shop in our catalogue",
    found.zoneId === ours.zoneId && found.tier === ours.tier && found.feeXaf === ours.feeXaf,
    "quoting somebody a different fee for having found the shop by searching would be arbitrary"
  );
  check(
    "but it says where it came from",
    found.source === "places" && ours.source === "merchant",
    "anything downstream that needs to know has to be able to tell"
  );
  check("the phone comes through, so the rider can call ahead", found.contactAtLocation === "+237 6 90 00 00 00");
  check("and a business with no phone is not given one", placeToLocation({ name: "X", formattedAddress: "Y", latitude: 3.84, longitude: 11.49, nationalPhone: null }, ZONES).contactAtLocation === null);
}

console.log("\nThe card tells a partner and a find apart, in words");
{
  const card = code(CARD);

  check(
    "a find is labelled as found on the map",
    /Found on the map|Trouvé sur la carte/.test(read(CARD)),
    "not a badge to decode and not a footnote"
  );
  /*
   * Read from the render, not from the whole file.
   *
   * The first version compared positions across the file and failed on correct
   * code, because `itemCount` is declared on the interface long before it is
   * rendered. What is being asserted is about the markup: the item count and
   * the freshness line sit inside the verified branch and nowhere else.
   */
  const render = card.slice(card.indexOf("<button"));
  check(
    "only a verified business shows an item count or a freshness line",
    /business\.verified \?/.test(render) &&
      render.indexOf("business.verified ?") < render.indexOf("itemCount") &&
      render.indexOf("business.verified ?") < render.indexOf("freshness &&"),
    "a menu we do not have is the exact thing v49 invented"
  );
  check(
    "a find carries no logo",
    /logoUrl: null/.test(card),
    "a business's mark is its trademark; the licit route to it is the business uploading it"
  );
  check(
    "and no opening state is guessed for one",
    /openNow: null/.test(card),
    "reading 'open now' out of weekly hours means deciding what a public holiday does to a Sunday, and a wrong Open sends a rider to a locked door"
  );
  check(
    "the open/closed pill is hidden rather than shown as closed when unknown",
    /business\.openNow !== null &&/.test(card),
    "'unknown' rendered as 'Closed' is a business losing orders because of us"
  );
  check(
    "there is no field on the card for a rating or a photograph",
    !/rating|reviewCount|photoUrl|coverUrl/i.test(card),
    "a field that exists will eventually be filled"
  );
  check(
    "the food row is this same card rather than a second copy of it",
    /BusinessCard/.test(code(ROW)) && code(ROW).length < 1600,
    "two rows is two places for the distinction to go missing"
  );
}

console.log("\nOurs come first, and the picker says which are ours");
{
  const picker = code(PICKER);
  const src = read(PICKER);

  check(
    "our own results are headed as confirmed by us",
    /Confirmed by us|Confirmés par nous/.test(src)
  );
  check(
    "found ones are headed separately",
    /Found on the map|Trouvés sur la carte/.test(src),
    "mixing the two lists is how the distinction is lost without anybody deciding to lose it"
  );
  check(
    "and they are rendered after ours in the document",
    picker.indexOf("results.map(") < picker.indexOf("found.map("),
    "a place somebody here has called beats anything a map knows about this city, and the order of the lists is where that is said"
  );
  check(
    "the customer is told plainly that we have not spoken to them",
    /we'll call ahead|nous appellerons|calls before buying|appellera avant/.test(src)
  );
}

console.log("\nDiscovery costs nothing when it is not wanted");
{
  const picker = code(PICKER);

  check(
    "nothing is searched until the screen can use a result",
    /if \(!onDiscovered \|\| !open\) return;/.test(picker),
    "offering a result that does nothing when tapped is worse than not offering it"
  );
  check(
    "nor until our own list has come back short",
    /results\.length >= 3/.test(picker),
    "every keystroke billing a Places search while our own list already answered is how a bill happens quietly"
  );
  check("nor on a half-typed word", /q\.length < 2/.test(picker));
  check("and it is debounced like every other search here", /250\)/.test(picker));
  check(
    "a business already in our list is not offered twice",
    /ours\.has\(/.test(picker),
    "the same shop under two headings reads as two shops"
  );
  check(
    "without a key the picker says so rather than looking empty",
    /no-key/.test(picker),
    "this is the state it runs in until the owner creates one"
  );
}

console.log("\nA find is never mistaken for a merchant of ours");
{
  const food = code("src/components/customer/order/forms/FoodForm.tsx");
  const medicine = code("src/components/customer/order/forms/MedicineForm.tsx");
  const parcel = code("src/components/customer/order/forms/ParcelForm.tsx");

  check(
    "food sends no merchant id for a discovered restaurant",
    /onDiscovered=\{\(b, loc\) => \{[\s\S]{0,200}setPickedMerchantId\(null\)/.test(food),
    "an id here would attach the order to a catalogue row that does not exist"
  );
  check(
    "pharmacy does the same",
    /pickFoundPharmacy[\s\S]{0,300}setValue\("merchantId", ""\)/.test(medicine)
  );
  check(
    "but both keep the pin, which is the whole point",
    /onDiscovered=\{\(b, loc\) => \{[\s\S]{0,260}setPickup\(loc\)/.test(food) &&
      /pickFoundPharmacy[\s\S]{0,400}applySel\("pickup", loc\)/.test(medicine),
    "without it this is just free text with extra steps"
  );
  check(
    "the food restaurant field is a picker, not a raw input",
    /<MerchantField/.test(food) && !/value=\{vendorName\}\s*\n\s*onChange=/.test(food),
    "the customer typed a name and the rider left with a name"
  );
  check(
    "parcel can name a business at the pickup end",
    /<MerchantField/.test(parcel) && /category="OTHER"/.test(parcel)
  );
  check(
    "a typed parcel business is not accepted as a location",
    /onFreeText=\{setPickupBusiness\}/.test(parcel),
    "a word with no coordinates cannot be priced, and filling the pin from one would mean inventing a fee"
  );
  check(
    "but it still reaches the rider",
    /pickupLandmark:\s*\n?\s*pickupBusiness/.test(parcel),
    "a name that sits on the screen and goes nowhere is the kind of field that looks like it works"
  );
}

console.log(
  `\n${failures === 0 ? "Found on a map is offered, priced and labelled as exactly that." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
