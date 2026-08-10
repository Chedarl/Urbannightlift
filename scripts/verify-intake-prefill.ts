/**
 * Proves the two rules that make prefilling a form safe.
 *
 * The bug this closes was not subtle: `QuickIntake` saved a draft and no order
 * form had ever read one, so the sentence a customer typed was parsed, stored
 * and discarded one navigation later. The fix is a read — and a read into boxes
 * somebody is about to submit needs guarding, because the two ways it can go
 * wrong are both expensive:
 *
 *  1. **It overwrites what they typed.** Somebody corrects a box, a value
 *     arrives late, the correction disappears, and the order goes out wrong.
 *  2. **It invents a place.** An address here is a `SelectedLocation` with
 *     coordinates, a zone and a tier, and the fee is computed from all three.
 *     Turning the word "Bastos" into one of those means inventing a price.
 *
 * So this proves that a filled box is never touched, and that a place arrives
 * as a suggestion rather than an answer.
 *
 * Run: npx tsx scripts/verify-intake-prefill.ts
 */
import { blank, keepTyped, asSentence, type IntakePrefill } from "../src/lib/orders/intakePrefill";
import { shapeIntake } from "../src/lib/ai/intake";
import type { ServiceType } from "@prisma/client";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nA box the customer has touched is never overwritten");
check("an empty box is filled", keepTyped("", "paracetamol") === "paracetamol");
check("a box of spaces counts as empty", keepTyped("   ", "paracetamol") === "paracetamol");
check(
  "a box with anything in it is left exactly alone",
  keepTyped("amoxicillin", "paracetamol") === "amoxicillin",
  "this is the correction-eaten-by-a-late-fetch bug, and it reaches a rider"
);
check(
  "one character is enough to count as typed",
  keepTyped("x", "paracetamol") === "x",
  "we do not get to decide that what somebody typed was too short to mean it"
);
check("an empty suggestion never blanks a filled box", keepTyped("amoxicillin", "") === "amoxicillin");
check("an empty suggestion never fills an empty box either", keepTyped("", "") === "");

console.log("\nWhat counts as empty");
check("undefined is empty", blank(undefined));
check("a number is not a string and is treated as empty", blank(3));
check("whitespace is empty", blank("\n \t "));
check("a real word is not", !blank("Bastos"));

console.log("\nA place is a suggestion, never an answer");
{
  const draft = shapeIntake(
    {
      serviceType: "FOOD_PICKUP",
      itemDescription: "deux pizzas",
      pickupLocation: "Dolcezza",
      deliveryLocation: "Bastos",
      quantity: 2,
    },
    ["FOOD_PICKUP"] as ServiceType[]
  );
  check("the sentence produced a draft at all", draft != null);
  check("the place names survive as words", draft?.pickupLocation === "Dolcezza" && draft?.deliveryLocation === "Bastos");
  check(
    "and they are words, not coordinates",
    typeof draft?.deliveryLocation === "string" &&
      !("lat" in (draft as unknown as Record<string, unknown>)) &&
      !("zoneId" in (draft as unknown as Record<string, unknown>)),
    "a fee is computed from a pin; a draft that carried one would be a price we made up"
  );
  check("a quantity they plainly said is kept", draft?.quantity === 2);
}

console.log("\nNothing is invented when nothing was said");
{
  const draft = shapeIntake(
    { serviceType: "FOOD_PICKUP", itemDescription: "poulet DG" },
    ["FOOD_PICKUP"] as ServiceType[]
  );
  check("an unsaid pickup comes back empty", draft?.pickupLocation === "");
  check("an unsaid delivery comes back empty", draft?.deliveryLocation === "");
  check(
    "so the picker offers nothing rather than something wrong",
    (draft?.deliveryLocation ?? "").trim().length === 0,
    "an empty box gets filled in; a plausible wrong one gets confirmed by somebody in a hurry"
  );
  check("quantity falls back to one", draft?.quantity === 1);
}

console.log("\nA paused service can never come back from a sentence");
{
  const draft = shapeIntake(
    { serviceType: "URGENT_ITEM", itemDescription: "something fast" },
    ["FOOD_PICKUP", "SMALL_PARCEL"] as ServiceType[]
  );
  check(
    "it falls back to an enabled service instead",
    draft?.serviceType === "FOOD_PICKUP",
    "routing somebody into a paused service is routing them into a form that refuses to submit"
  );
}

console.log("\nThe free-form fold");
{
  const p: IntakePrefill = {
    itemDescription: "one envelope",
    pickupSuggestion: "",
    deliverySuggestion: "",
    notes: "gate code 4471",
    quantity: 1,
  };
  check("both halves are carried", asSentence(p) === "one envelope. gate code 4471");
  check("an absent half adds no stray punctuation", asSentence({ ...p, notes: "" }) === "one envelope");
  check("nothing said produces nothing", asSentence({ ...p, itemDescription: "", notes: "" }) === "");
}

console.log(
  `\n${failures === 0 ? "The sentence reaches the form, and never over the top of the customer." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
