/**
 * Proves the night medicine list helps without pretending to be a stock list.
 *
 * ## Why this list exists
 *
 * The medicine rows on the pharmacy page are blank text boxes. There is a shelf
 * that fills them — `addShelfItem` — but it reads one *merchant's*
 * `MerchantProduct` rows, and production has no verified pharmacy, so the shelf
 * never renders. Somebody with a feverish child was spelling a drug name from
 * memory at 2 AM into a box a pharmacist would read aloud.
 *
 * ## The two ways a list like this does harm
 *
 * **It quotes a price.** The source list carried one per item. This product's
 * medicine flow is written on `addShelfItem`: the pharmacy's till decides the
 * amount and the rider photographs the receipt. A price on this screen
 * contradicts the screen, and a customer quoted 3,500 who pays 4,200 was
 * misled by us rather than by the pharmacy.
 *
 * **It implies stock.** We hold no pharmacy's inventory. This is vocabulary,
 * the same as the landmark chips — and it has to say so where somebody reading
 * the list will see it.
 *
 * Run: npx tsx scripts/verify-pharmacy-items.ts
 */

import fs from "node:fs";
import path from "node:path";

import {
  COMMON_PHARMACY_ITEMS,
  PHARMACY_CATEGORIES,
  PHARMACY_CATEGORY_LABEL,
  searchPharmacyItems,
  itemsByCategory,
} from "../src/lib/pharmacy/commonItems";

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

const ITEMS = "src/lib/pharmacy/commonItems.ts";
const PANEL = "src/components/customer/pharmacy/CommonMedicines.tsx";
const FORM = "src/components/customer/order/forms/MedicineForm.tsx";

console.log("It names medicines and quotes nobody a price");
{
  const items = code(ITEMS);

  check("there are enough to be worth showing", COMMON_PHARMACY_ITEMS.length >= 15, `${COMMON_PHARMACY_ITEMS.length}`);
  check(
    "no item carries a price",
    !/\bprice\b|priceXaf|\bXAF\b|\bFCFA\b/i.test(items) &&
      !COMMON_PHARMACY_ITEMS.some((i) => "price" in (i as object)),
    "the pharmacy's till decides the amount and the rider photographs the receipt — a price here contradicts the screen it sits on"
  );
  check(
    "and the panel quotes none either",
    !/\bprice\b|XAF|FCFA/i.test(code(PANEL))
  );
  check(
    "the panel says in words that it is not a stock list",
    /not a stock|pas un stock/i.test(read(PANEL)),
    "we hold no pharmacy's inventory, and a list of drugs reads as one unless it says otherwise"
  );
}

console.log("\nThe prescription flag is carried, and acted on");
{
  const form = code(FORM);
  const panel = code(PANEL);

  check("every item states whether it needs one", COMMON_PHARMACY_ITEMS.every((i) => typeof i.requiresPrescription === "boolean"));
  check(
    "the antimalarials do",
    itemsByCategory("MALARIA").filter((i) => i.requiresPrescription).length >= 2,
    "Coartem and Maloxine are prescription-only in Cameroon"
  );
  check(
    "and the plasters do not",
    itemsByCategory("FIRST_AID").every((i) => !i.requiresPrescription),
    "a customer who thinks they need a doctor's note to buy compresses at 1 AM closes the tab"
  );
  check(
    "it is said on the item rather than in a legend",
    /Prescription needed|Ordonnance requise/.test(read(PANEL)),
    "somebody scanning the list needs to know before they tap, not after"
  );
  check(
    "tapping a prescription-only item moves them to that branch",
    /requiresPrescription && !onPrescriptionBranch\) onNeedsPrescription\(\)/.test(panel) &&
      /prescriptionType[\s\S]{0,60}"PRESCRIPTION"/.test(form),
    "otherwise a rider finds out at a counter at 2 AM with the customer asleep"
  );
}

console.log("\nIt is searchable the way people actually ask");
{
  check("a brand name finds it", searchPharmacyItems("doliprane").length > 0);
  check("so does the molecule", searchPharmacyItems("paracétamol").length > 0);
  check(
    "and so does the ailment",
    searchPharmacyItems("palu").length > 0 || searchPharmacyItems("malaria").length > 0
  );
  check(
    "accents are not required",
    searchPharmacyItems("fievre").length > 0 && searchPharmacyItems("serum").length > 0,
    "a phone keyboard at 2 AM does not produce 'fièvre'"
  );
  check("an empty query returns nothing rather than everything", searchPharmacyItems("").length === 0);
  check("nonsense returns nothing", searchPharmacyItems("qqqqzzz").length === 0);
}

console.log("\nEvery group is labelled and populated");
{
  check("all categories have items", PHARMACY_CATEGORIES.every((c) => itemsByCategory(c).length > 0));
  check("all have a label in both languages", PHARMACY_CATEGORIES.every((c) => PHARMACY_CATEGORY_LABEL[c].en && PHARMACY_CATEGORY_LABEL[c].fr));
  check(
    "malaria comes first",
    PHARMACY_CATEGORIES[0] === "MALARIA",
    "it is the commonest reason somebody needs a pharmacy in this city at night"
  );
  check("no item is listed twice", new Set(COMMON_PHARMACY_ITEMS.map((i) => i.name)).size === COMMON_PHARMACY_ITEMS.length);
  check("each has a description in both languages", COMMON_PHARMACY_ITEMS.every((i) => i.description && i.descriptionFr));
}

console.log("\nIt lands in the list the customer already has");
{
  const form = code(FORM);
  check(
    "a tapped item fills a medicine row",
    /function addCommonItem/.test(form) && /serviceDetails\.meds\./.test(form)
  );
  check(
    "it does not open a cart or price anything",
    !/addCommonItem[\s\S]{0,400}(priceXaf|estimatedFee|goodsEstimate)/.test(form),
    "these are a name for the pharmacist, not a purchase"
  );
  check(
    "and the same item cannot be added twice",
    /addCommonItem[\s\S]{0,300}some\(\(m\) => m\?\.name/.test(form)
  );
}

console.log(
  `\n${failures === 0 ? "Twenty names, one prescription flag, and not one price we are not entitled to quote." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
