/**
 * Proves a business can be saved on what a business's own page actually shows.
 *
 * ## The bug
 *
 * `POST /api/merchants` demanded a **street address**, and `Merchant.address`
 * was NOT NULL. So the owner would photograph a restaurant's Instagram page,
 * watch the name, the phone, the quartier and the hours come back right — and
 * find the Save button dead. Reported as "the capture is not picking up the
 * information"; it was picking it up perfectly and had nowhere to put it.
 *
 * The rule was wrong in a way this product, of all products, should have caught:
 * **Yaoundé does not use street addresses.** `resolveAddress` ranks places we
 * have delivered to above any geocoder, `VerifiedPlace` collects real GPS off
 * completed deliveries, and every order form asks for a landmark. The catalogue
 * was demanding the one field the city does not have.
 *
 * It also produced invented data quietly: `intakeMerchant` filled the mandatory
 * column with the quartier plus "Yaoundé", and for a merchant who gave neither,
 * with the literal address **"Yaoundé"** — which a rider would read as an
 * address.
 *
 * ## What is proved here
 *
 * The shapes a real capture produces, and the boundary: a name, a category, a
 * reachable number, and *somewhere* — a quartier, a pin, or an address. And
 * that the panel and the endpoint cannot disagree, because both call this.
 *
 * Run: npx tsx scripts/verify-merchant-complete.ts
 */
import {
  missingForMerchant,
  isSaveableMerchant,
  hasSomewhere,
  describeMissing,
} from "../src/lib/merchants/complete";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nWhat a real Instagram page gives you is enough");
check(
  "name, category, WhatsApp and a quartier saves",
  isSaveableMerchant({
    merchantName: "Chez Maman Josephine",
    category: "FOOD",
    whatsappNumber: "237690123456",
    neighbourhood: "Biyem-Assi",
  }),
  "this is the exact shape the capture returns, and it could not be saved before"
);
check(
  "a dropped pin is enough on its own",
  isSaveableMerchant({
    merchantName: "Pharmacie du Stade",
    category: "PHARMACY",
    whatsappNumber: "237690123456",
    latitude: 3.848,
    longitude: 11.5021,
  })
);
check(
  "a written address still works for the businesses that have one",
  isSaveableMerchant({
    merchantName: "Dolcezza",
    category: "FOOD",
    whatsappNumber: "237658597755",
    address: "Nouvelle Route Bastos",
  })
);
check(
  "a lower-case category is accepted the way the model returns it",
  isSaveableMerchant({
    merchantName: "X Snack",
    category: "food",
    whatsappNumber: "237690123456",
    neighbourhood: "Essos",
  })
);
check(
  "the landline counts when there is no WhatsApp field",
  isSaveableMerchant({
    merchantName: "X Snack",
    category: "FOOD",
    phone: "237222001122",
    neighbourhood: "Essos",
  })
);

console.log("\nAnd nowhere at all is still nowhere");
const nowhere = { merchantName: "X Snack", category: "FOOD", whatsappNumber: "237690123456" };
check("no quartier, no pin, no address → not saveable", !isSaveableMerchant(nowhere));
check("and it says which one is missing", missingForMerchant(nowhere).includes("where"));
check(
  "a rider needs somewhere to be sent",
  !hasSomewhere({}) && !hasSomewhere({ neighbourhood: " " }) && !hasSomewhere({ latitude: 3.8 })
);

console.log("\nThings that must still be refused");
check(
  "no name",
  missingForMerchant({ category: "FOOD", whatsappNumber: "237690123456", neighbourhood: "Essos" }).includes(
    "merchantName"
  )
);
check(
  "a category we do not recognise is not a category",
  missingForMerchant({
    merchantName: "X",
    category: "RESTAURANT_BAR",
    whatsappNumber: "237690123456",
    neighbourhood: "Essos",
  }).includes("category")
);
check(
  "an eight-digit number reaches nobody",
  missingForMerchant({
    merchantName: "X Snack",
    category: "FOOD",
    whatsappNumber: "6901234",
    neighbourhood: "Essos",
  }).includes("whatsappNumber"),
  "a partial number looks like a contact and is worse than a blank one"
);
check("an empty draft is missing all four", missingForMerchant({}).length === 4);

console.log("\nThe sentence the panel shows is the sentence the endpoint returns");
check(
  "one missing field reads as a sentence",
  describeMissing(["where"]) === "Still needs somewhere to find them — a quartier, a pin, or an address."
);
check(
  "several are listed properly",
  describeMissing(["merchantName", "category", "whatsappNumber"]) ===
    "Still needs a name, a category and a WhatsApp number."
);
check("nothing missing says nothing", describeMissing([]) === "");
check("and it can say it in French", describeMissing(["where"], true).includes("quartier"));

console.log("\nThe order is form order, so the first thing named is the first thing to fix");
check(
  "name, then category, then number, then where",
  JSON.stringify(missingForMerchant({})) ===
    JSON.stringify(["merchantName", "category", "whatsappNumber", "where"])
);

console.log(
  `\n${failures === 0 ? "A business is saveable on what a business actually shows you." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
