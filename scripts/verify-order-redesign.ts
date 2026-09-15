/**
 * Proves the redesigned order screens kept the promises the old ones made.
 *
 * A redesign is where guarantees go to die. The rules below are not style
 * preferences — each one is something this product got wrong once, in
 * production, at a cost. A rewrite that produces a better-looking screen and
 * quietly drops one of them is a worse outcome than the screen it replaced.
 *
 * Run: npx tsx scripts/verify-order-redesign.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { quoteDeliveryFee } from "../src/lib/orders/pricing";
import { DEFAULT_FARE, fareRulesFrom } from "../src/lib/orders/fare";
import { INSURED_VALUE_CAP_XAF } from "../src/lib/i18n/legal";
import { initialsOf } from "../src/lib/food/artwork";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * A file with its comments removed.
 *
 * Three checks in this repo have passed by matching their own explanatory
 * comment rather than any shipped code. A rule that a comment can satisfy is
 * not a rule.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

const FOOD = "src/components/customer/order/forms/FoodForm.tsx";
const MEDICINE = "src/components/customer/order/forms/MedicineForm.tsx";
const PARCEL = "src/components/customer/order/forms/ParcelForm.tsx";
const MENU = "src/components/customer/food/MerchantMenu.tsx";
const BAR = "src/components/customer/order/CartBar.tsx";
const ERRAND = "src/components/customer/order/forms/ErrandForm.tsx";
const GROCERY = "src/components/customer/order/forms/GroceryForm.tsx";
const REVIEW = "src/components/customer/OrderReview.tsx";
const CHECKOUT = "src/components/customer/order/CheckoutBar.tsx";

console.log("\nThe catalogue still cannot be filled in by the interface");
{
  /*
    The failure this guards against actually shipped: three invented
    restaurants, with invented addresses, menus and prices, illustrated with
    hot-linked stock photography, live on the food screen. A customer could
    order a named dish at a named price from a business that may not exist.
  */
  const food = code(FOOD);
  const menu = code(MENU);

  check(
    "the merchant list is fetched, never literal",
    /fetch\("\/api\/food\/browse"\)/.test(food),
    "the restaurants must come from the verified catalogue"
  );

  // Any http(s) image source in these files would be a hot-linked photograph of
  // food we have not seen. The generated artwork is CSS gradients and carries
  // no URL at all.
  for (const [label, src] of [
    ["food screen", food],
    ["menu", menu],
  ] as const) {
    check(
      `no remote image source in the ${label}`,
      !/(src|url)\s*[=(]\s*["'`]https?:/i.test(src),
      "stock photography is how this screen shipped invented restaurants"
    );
  }

  check(
    "the empty catalogue still says so and still takes the order",
    /merchants\.length === 0/.test(food) && /vendorName/.test(food),
    "an empty list must fall through to the free-text path, not a dead end"
  );
}

console.log("\nA sold-out dish is shown as sold out, never removed");
{
  const menu = code(MENU);
  check(
    "the menu renders soldOut rather than filtering on it",
    /item\.soldOut/.test(menu) && !/filter\([^)]*soldOut/.test(menu),
    "'they ran out tonight' is information; a dish that vanishes reads as one we never had"
  );
}

console.log("\nThe goods estimate is never handed over as the delivery fee");
{
  const food = code(FOOD);
  /*
    This exact conflation shipped: `subtotal + 1500` was passed as
    `estimatedFeeXaf` and marked firm, so a 6,500 XAF meal was presented as an
    8,000 XAF *delivery fee*.
  */
  check(
    "estimatedFeeXaf is left for the server",
    /estimatedFeeXaf:\s*null/.test(food),
    "the screen must not declare a fee as the order of record"
  );
  check(
    "the cart total goes to goodsCapXaf, which is what a spending cap is",
    /goodsCapXaf:\s*goodsEstimateXaf/.test(food),
    "the shop's price and our fee are different numbers with different owners"
  );
  check(
    "priceFirm is never asserted from the food screen",
    /priceFirm:\s*false/.test(food),
    "a screen may estimate; only the server may call a price firm"
  );
}

console.log("\nThe bar never invents a price");
{
  const bar = code(BAR);
  check(
    "a null fare renders words, not a number",
    /fare\s*\?/.test(bar) && /hint/.test(bar),
    "a placeholder figure on this line would be the most expensive lie in the product"
  );
  check(
    "an estimate is marked as one",
    /fare\.estimated/.test(bar),
    "a zone-only figure must read 'about 1,500', never '1,500'"
  );
  check(
    "all five services use the one bar",
    [FOOD, MEDICINE, PARCEL, ERRAND, GROCERY].every((f) => /<CartBar\b/.test(code(f))),
    "five hand-rolled footers is how customers learn the services are priced differently"
  );
  check(
    "and the checkout screen has one too",
    /<CheckoutBar\b/.test(code(REVIEW)),
    "the screen whose whole job is confirming a price had the total below the fold"
  );
  check(
    "which never calls a ceiling a total",
    /totalIsCeiling/.test(code(CHECKOUT)),
    "a shopping order's figure is a cap until the rider is at the counter"
  );
}

console.log("\nThe screen quotes with the same function the server charges with");
{
  /*
    The whole reason `useLiveFare` is three functions long. If the client ever
    grew its own arithmetic, the quoted price and the charged price would drift,
    and a screen that says 1,800 against a receipt that says 2,400 is a bigger
    problem than an ugly form.
  */
  const hook = code("src/lib/orders/useLiveFare.ts");
  check(
    "useLiveFare delegates to quoteDeliveryFee",
    /quoteDeliveryFee\(/.test(hook),
    "the client must not reimplement the fare"
  );
  check(
    "and does no fare arithmetic of its own",
    !/(minimumXaf|perKmXaf|includedKm)\s*[*+]/.test(hook),
    "any multiplication of a tariff field here is a second pricing implementation"
  );

  // The same inputs through both paths must agree, because they are one path.
  const bastos = { lat: 3.8917, lng: 11.5167 };
  const mvan = { lat: 3.8167, lng: 11.5333 };
  const zone = { id: "z", feeXaf: 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: "YELLOW" as const };
  const viaDefaults = quoteDeliveryFee(zone, zone, { pickup: bastos, delivery: mvan, rules: DEFAULT_FARE });
  const viaSettings = quoteDeliveryFee(zone, zone, { pickup: bastos, delivery: mvan, rules: fareRulesFrom(null) });
  check(
    "an unedited tariff row prices identically to the defaults",
    viaDefaults?.totalXaf === viaSettings?.totalXaf,
    `${viaDefaults?.totalXaf} vs ${viaSettings?.totalXaf} — a customer would be quoted one and charged the other`
  );
  check(
    "a real Bastos → Mvan ride prices above the minimum",
    (viaDefaults?.totalXaf ?? 0) > DEFAULT_FARE.minimumXaf,
    "8-plus km must cost more than the 2.5 km the minimum buys"
  );
}

console.log("\nThe tariff is published, and nothing else is");
{
  const settings = code("src/app/api/settings/route.ts");
  const publicBlock = settings.slice(settings.indexOf("export async function GET"), settings.indexOf("PATCH"));
  check(
    "the public settings response carries the fare rules",
    /fareRules:\s*fareRulesFrom\(settings\)/.test(publicBlock),
    "the order screens cannot quote a fee they have not been told the rules for"
  );
  // Merchant codes decide where customer money goes. They have no business in a
  // response any visitor can read, and this endpoint has leaked before.
  for (const secret of ["momoMerchantCode", "orangeMerchantCode", "ussdTemplate"]) {
    check(
      `${secret} stays out of the public response`,
      !new RegExp(`${secret}\\s*:`).test(publicBlock),
      "only availability is public; the codes go to the one customer with an order to pay"
    );
  }
}

console.log("\nA parcel is never shown as insured beyond what we would pay");
{
  const parcel = code(PARCEL);
  check(
    "the cover limit is the shared constant, not a number typed on the screen",
    /INSURED_VALUE_CAP_XAF/.test(parcel) && !/25[ ,_]?000/.test(parcel),
    "a literal here drifts away from the figure the server flags on"
  );
  check(
    "the cover bar cannot fill past the cap",
    /Math\.min\(100,/.test(parcel),
    "a bar past 100% would show cover we do not offer"
  );
  check(
    "declaring above the cap is answered on screen",
    /overCap/.test(parcel),
    "a customer typing 120,000 must be told where cover actually stops"
  );
  check(
    "and the cap itself is a real, non-zero figure",
    INSURED_VALUE_CAP_XAF > 0,
    "cover of zero would make the whole line a lie"
  );
}

console.log("\nPrivate uploads stay private");
{
  /*
    Standing rule: a prescription photograph and a parcel photograph must never
    reach a public URL or the shared order-summary PDF. Both screens say so to
    the customer, and the say-so has to still be there.
  */
  for (const [label, path] of [
    ["prescription", MEDICINE],
    ["parcel photo", PARCEL],
  ] as const) {
    const src = read(path);
    check(
      `the ${label} upload still states it is private`,
      /never in the shared PDF|jamais dans le PDF partagé|never appears in the shared PDF|ne figure jamais dans le PDF/.test(src),
      "the promise disappeared from the screen in the redesign"
    );
    check(
      `the ${label} goes to the private bucket`,
      /bucket:\s*"order-screenshots"/.test(code(path)),
      "order-screenshots is the private bucket; a public one would expose it"
    );
  }
}

console.log("\nThe medicine fork actually forks");
{
  const med = code(MEDICINE);
  check(
    "the prescription-only block is conditioned on the branch",
    /prescriptionType\s*!==\s*"PRESCRIPTION"\s*&&\s*"hidden"/.test(med),
    "an upload box shown on the over-the-counter branch reads as a requirement"
  );
  check(
    "the branch still reaches the server as prescriptionRequired",
    /prescriptionRequired:\s*prescriptionType === "PRESCRIPTION"/.test(med),
    "the fork must decide the order, not only the layout"
  );
}

console.log("\nNothing shrank below the 13px floor");
{
  // `text-xs` is 13px in this app, raised from Tailwind's 12. The escape hatch
  // is the thing to guard: a floor with `text-[10px]` still available is not a
  // floor, and 354 of those is how it got here the first time.
  for (const path of [FOOD, MEDICINE, PARCEL, MENU, BAR, "src/components/customer/food/MerchantRow.tsx"]) {
    const bad = read(path).match(/text-\[\d+(\.\d+)?px\]/g) ?? [];
    check(
      `${path.split("/").pop()} sets no arbitrary font size`,
      bad.length === 0,
      `${bad.join(", ")} — this app is read one-handed, outdoors, at night`
    );
  }
}

console.log("\nA dish tile shows the dish's letter, not the restaurant's");
{
  /*
    `artworkFor` derives the palette *and* the initials from one seed, and the
    seed for a dish tile is "<restaurant> <dish>" so that two restaurants
    selling the same dish do not produce identical art. The side effect shipped:
    every tile on a menu carried the restaurant's own initials — eleven dishes,
    eleven tiles reading "MJ". The colour wants both; the letter has to come
    from the dish or it is saying nothing.
  */
  check(
    'initialsOf("Chez Maman Josephine Brochette de boeuf") really is the restaurant',
    initialsOf("Chez Maman Josephine Brochette de boeuf") === initialsOf("Chez Maman Josephine"),
    "if this ever stops being true the guard below is measuring nothing"
  );
  check(
    "two dishes at one restaurant get different letters",
    initialsOf("Brochette de boeuf") !== initialsOf("Poulet DG"),
    "a menu of identical letters is worse than no letter at all"
  );
  for (const path of [MENU, "src/components/customer/food/RestaurantCard.tsx"]) {
    check(
      `${path.split("/").pop()} takes the tile letter from the item name`,
      /initialsOf\(item\.name\)/.test(code(path)) && !/dishArt\.initials/.test(code(path)),
      "dishArt.initials is the restaurant's letters, not the dish's"
    );
  }
}

console.log("\nThe journey is one product, not two");
{
  /*
    The v49 redesign reached three of the five order forms and stopped. What
    made that visible was not the forms themselves but the seams: a customer on
    parcel saw one visual language, a customer on errand saw the one it
    replaced, and nobody comparing two screens of the same app should have to
    wonder which is the real one.
  */
  const JOURNEY = [
    FOOD, MEDICINE, PARCEL, ERRAND, GROCERY, REVIEW,
    "src/components/customer/OrderForm.tsx",
    "src/components/customer/OrderConfirmation.tsx",
  ];

  for (const path of JOURNEY) {
    check(
      `${path.split("/").pop()} has no gradient hero left`,
      !/rounded-b-\[2rem\]/.test(code(path)),
      "the 2rem-radius gradient block is the pattern being replaced"
    );
  }

  /*
    `code()`, not `read()`.

    The first version of this used `read()` and failed on three files whose
    *comments* explain that the badge was removed. That is the fourth time a
    check in this repo has matched its own prose rather than any shipped code —
    it is a cheap mistake and it is always the same one, so: strip comments
    first, every time.
  */
  check(
    "no screen prints a hardcoded step number",
    !JOURNEY.some((p) => /Step \d of \d|Étape \d sur \d/.test(code(p))),
    "a text badge on two screens plus a graphical stepper on a third is worse than neither"
  );
  check(
    "and the stepper component is gone entirely",
    !existsSync(join(ROOT, "src/components/customer/order/Stepper.tsx")),
    "it rendered at step 1 on two of seven services, step 2 on review, and never step 3"
  );

  // One width, so the bars and the content they belong to line up.
  for (const path of [FOOD, MEDICINE, PARCEL, ERRAND, GROCERY, BAR, CHECKOUT]) {
    check(
      `${path.split("/").pop()} is max-w-lg like every other customer screen`,
      !/max-w-(xl|3xl|md|6xl)\b/.test(code(path)),
      "four container widths across one journey is how the seams become visible"
    );
  }
}

console.log("\nDead weight stays dead");
{
  check(
    "the unused night-scene hero is deleted",
    !existsSync(join(ROOT, "src/components/customer/NightSceneHero.tsx")),
    "160 lines with zero importers, and the canonical example of the old hero"
  );
  const svc = code("src/components/customer/order/ServiceSection.tsx");
  for (const dead of ["FOOD_PICKUP", "MEDICINE_PICKUP", "GROCERY_PICKUP", "SMALL_PARCEL", "CUSTOM_ERRAND"]) {
    check(
      `ServiceSection no longer carries a dead ${dead} branch`,
      !new RegExp(`case "${dead}"`).test(svc),
      "these five have their own screens; the bodies here were unreachable and answered searches with the wrong file"
    );
  }
}

console.log("\nEvery touched file is still text");
{
  /*
    A raw NUL byte got into `MerchantMenu.tsx` writing this change — from a
    ` ` sentinel that reached the file as an actual byte rather than an
    escape. Git then treats the file as binary: no diff, no review, no blame.
    Cheap to check, and invisible until somebody opens a pull request.
  */
  for (const path of [
    FOOD,
    MEDICINE,
    PARCEL,
    MENU,
    BAR,
    CHECKOUT,
    ERRAND,
    GROCERY,
    "src/components/customer/food/MerchantRow.tsx",
    "src/lib/orders/useLiveFare.ts",
  ]) {
    const bytes = readFileSync(join(ROOT, path));
    check(
      `${path.split("/").pop()} contains no control bytes`,
      !bytes.includes(0) && !bytes.includes(0x0c),
      "git would treat this file as binary and show no diff"
    );
  }
}

console.log("\nThe menu is a rail and rows, not a grid of missing photographs");
{
  const menu = code(MENU);
  check(
    "categories are a navigable rail with counts",
    /<nav\b/.test(menu) && /count/.test(menu),
    "a count makes an empty category visible before you tap it"
  );
  check(
    "a single category draws no rail",
    /rows\.length < 2/.test(menu),
    "one category is a label, not a choice, and a rail of one wastes a fifth of the screen"
  );
  check(
    "dishes are list rows",
    /<ul\b[\s\S]*<li\b/.test(menu),
    "the two-column picture grid is the pattern that needs photographs we do not have"
  );
}

console.log(
  failures === 0
    ? "\nAll good — the redesign kept every promise the old screens made.\n"
    : `\n${failures} failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
