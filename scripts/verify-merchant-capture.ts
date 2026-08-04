/**
 * Proves that capturing a merchant quickly does not mean capturing them wrongly.
 *
 * The whole point of reading a screenshot or a WhatsApp thread is speed, and
 * speed is exactly what makes a bad field dangerous: at fifteen seconds a
 * business you stop reading the form. So the layer between the model and the
 * draft is held to three rules here.
 *
 *  - **An unstated fact stays unstated.** `nightOpen` is tri-state on purpose.
 *    Collapsing "we were not told" into `false` would mark every captured
 *    business as closed at night — the only hour this company trades.
 *  - **A partial phone number is no phone number.** Eight digits looks like a
 *    contact and reaches nobody. Blank at least gets asked on the next call.
 *  - **A guessed price never reaches a customer.** The same rule the menu photo
 *    already follows.
 *
 * And the duty roster is held to a stricter one still: a shift with an
 * unreadable date is dropped entirely, because a half-read roster row looks
 * authoritative and sends somebody across the city at 2 AM to a closed door.
 *
 * Run: npx tsx scripts/verify-merchant-capture.ts
 */
import { shapeDraft, type CaptureAnswer } from "../src/lib/ai/merchantCapture";
import { shapeDutyRows } from "../src/lib/ai/dutyPoster";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

/** What a real Instagram profile header yields. */
const REAL: CaptureAnswer = {
  merchantName: "Chez Maman Josephine",
  category: "food",
  subcategory: "braise",
  phone: "+237 6 90 12 34 56",
  neighbourhood: "Biyem-Assi",
  openingHours: "18h - 02h",
  nightOpen: true,
  socialUrl: "https://instagram.com/chezmamanjosephine",
  products: [{ name: "Poisson braisé", priceXaf: 3500 }, { name: "Poulet DG", priceXaf: 5000 }],
};

console.log("\nA real business page");
const draft = shapeDraft(REAL)!;
check("the name survives", draft.merchantName === "Chez Maman Josephine");
check("a lower-case category is still recognised", draft.category === "FOOD", String(draft.category));
check("the phone becomes digits", draft.phone === "237690123456", String(draft.phone));
check(
  "WhatsApp falls back to the phone, because it is nearly always the same number here",
  draft.whatsappNumber === "237690123456"
);
check("the quartier survives", draft.neighbourhood === "Biyem-Assi");
check("night opening is carried", draft.nightOpen === true);
check("prices come through", draft.products.length === 2 && draft.products[0].priceXaf === 3500);

console.log("\nWhat was not said stays unsaid");
const sparse = shapeDraft({ merchantName: "Pharmacie du Stade", category: "PHARMACY" })!;
check(
  "nightOpen is null, not false",
  sparse.nightOpen === null,
  "false would say 'this pharmacy is shut at night' — a claim nobody made, about the only hours we trade"
);
check("open24h is null, not false", sparse.open24h === null);
check("a missing phone is null", sparse.phone === null);
check("a missing quartier is null", sparse.neighbourhood === null);
check("no products is an empty list, never invented ones", sparse.products.length === 0);

console.log("\nThings that must not get through");
check("no name at all → no draft", shapeDraft({ phone: "690123456" }) === null);
check("a blank name → no draft", shapeDraft({ merchantName: "   " }) === null);
check(
  "an eight-digit phone is dropped",
  shapeDraft({ merchantName: "X Snack", phone: "6901234" })!.phone === null,
  "a partial number looks like a contact and reaches nobody"
);
check(
  "an unknown category is dropped rather than guessed",
  shapeDraft({ merchantName: "X Snack", category: "RESTAURANT_BAR" })!.category === null
);
check(
  "a zero or negative price becomes unknown",
  shapeDraft({ merchantName: "X", products: [{ name: "Beignets", priceXaf: 0 }] })!.products[0].priceXaf === null
);
check(
  "a two-letter product name is noise and is dropped",
  shapeDraft({ merchantName: "X", products: [{ name: "ab", priceXaf: 500 }] })!.products.length === 0
);
check(
  "a very long name is cut, not rejected",
  shapeDraft({ merchantName: "Y".repeat(200) })!.merchantName!.length === 80
);

console.log("\nThe duty roster is stricter — a wrong row sends somebody out at 2 AM");
const rows = shapeDutyRows([
  { pharmacyName: "Pharmacie du Stade", neighbourhood: "Mvog-Mbi", phone: "6 90 11 22 33", startsOn: "2026-08-03", endsOn: "2026-08-09" },
  { pharmacyName: "Pharmacie Aurore", startsOn: "2026-08-03", endsOn: "2026-08-09" },
  // The ones that must not survive:
  { pharmacyName: "Pharmacie Sans Date", startsOn: "2026-08-03" },
  { pharmacyName: "Pharmacie Mauvaise Date", startsOn: "du 3 au 9 août", endsOn: "2026-08-09" },
  { pharmacyName: "Pharmacie A L'Envers", startsOn: "2026-08-09", endsOn: "2026-08-03" },
  { pharmacyName: "ABC", startsOn: "2026-08-03", endsOn: "2026-08-09" },
  { pharmacyName: "Pharmacie du Stade", neighbourhood: "Mvog-Mbi", startsOn: "2026-08-03", endsOn: "2026-08-09" },
]);
check("the two good rows survive", rows.length === 2, `got ${rows.length}: ${rows.map((r) => r.pharmacyName).join(", ")}`);
check("the phone is normalised", rows[0].phone === "690112233", String(rows[0].phone));
check("a missing end date drops the row", !rows.some((r) => r.pharmacyName.includes("Sans Date")));
check(
  "a date that is not a date drops the row",
  !rows.some((r) => r.pharmacyName.includes("Mauvaise")),
  "'du 3 au 9 août' is what the poster says, but it is not something we can store"
);
check("a backwards window drops the row", !rows.some((r) => r.pharmacyName.includes("Envers")));
check("a three-letter name is not a pharmacy", !rows.some((r) => r.pharmacyName === "ABC"));
check("the same pharmacy on the same date is not duplicated", rows.filter((r) => r.pharmacyName === "Pharmacie du Stade").length === 1);
check("a roster with nothing readable is an empty list, not a crash", shapeDutyRows([]).length === 0);

console.log(
  `\n${failures === 0 ? "Fast to capture, and still nothing invented." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
