/**
 * Proves splitting the pharmacy form did not cost anything it was holding.
 *
 * ## Why the form was split
 *
 * Rendered at 390px it was **3,430 pixels tall** — about nine phone screens of
 * seventeen stacked cards before the submit button, on the screen somebody
 * reaches at 2 AM with a sick child. The food form stopped looking like that in
 * v51 when it was split into list → menu → details. This is the same split:
 * which pharmacy → what do you need → where are we taking it.
 *
 * ## The three ways a split like this goes wrong
 *
 * **It loses what people typed.** react-hook-form is the only thing holding
 * these values, and unmounting a stage is how a customer walks back and finds
 * their uploaded prescription gone. Every stage is `hidden`, never conditionally
 * rendered — the same decision the prescription branch already made two hundred
 * lines down, for the same reason.
 *
 * **It hides the error it is reporting.** Validation runs on the last stage;
 * `pickupLocation` lives on the first. Without routing, the customer reads
 * "Please complete: Pharmacy location" beside a screen that does not contain
 * it, and `scrollIntoView` targets a field inside a `display: none` container,
 * which scrolls nowhere.
 *
 * **It turns the screen into a progress bar.** This repo tore "Step 1 of 3"
 * badges out of these very forms. A stage is named by the question it asks.
 *
 * Run: npx tsx scripts/verify-medicine-stages.ts
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
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FORM = "src/components/customer/order/forms/MedicineForm.tsx";
const src = code(FORM);
const raw = read(FORM);

console.log("There are three stages and they are named by their question");
{
  check(
    "the stage names are the three decisions, in order",
    /useState<"pharmacy" \| "medicines" \| "details">\("pharmacy"\)/.test(src)
  );
  for (const q of ["Which pharmacy?", "What do you need?", "Where are we taking it?"]) {
    check(`the heading asks "${q}"`, raw.includes(q));
  }
  check(
    "and in French too",
    /Quelle pharmacie \?/.test(raw) && /Que faut-il \?/.test(raw) && /On livre où \?/.test(raw)
  );
  check(
    "no step counter came back",
    !/Step \d|Étape \d|stepIndex|totalSteps|of 3</i.test(src)
  );
}

console.log("");
console.log("Nothing typed can be lost by stepping back");
{
  const wrappers = src.match(/stage !== "(pharmacy|medicines|details)" && "hidden"/g) ?? [];
  check("every stage is hidden rather than unmounted", wrappers.length === 3, `${wrappers.length} found`);
  check(
    "no stage is conditionally rendered away",
    !/\{stage === "(pharmacy|medicines|details)" && \(/.test(src)
  );
  check(
    "the field array and the form live above the stages",
    src.indexOf("useFieldArray") < src.indexOf('stage !== "pharmacy"')
  );
}

console.log("");
console.log("A failed submit lands on the stage holding the problem");
{
  check("the error-to-stage map exists", /const stageOf: Record<string, "pharmacy"/.test(src));
  check("the pharmacy location routes to the first stage", /pickupLocation: "pharmacy"/.test(src));
  check("the medicine list routes to the second", /itemDescription: "medicines"/.test(src));
  check("the spending cap routes to the second", /goodsCapXaf: "medicines"/.test(src));
  check(
    "anything else stays on the last stage, where submit happened",
    /firstElsewhere \?\? "details"/.test(src)
  );
  check(
    "the scroll waits for the stage to be painted",
    /requestAnimationFrame\(\(\) =>[\s\S]{0,160}scrollIntoView/.test(src)
  );
  check(
    "every routed key is a key onInvalid actually labels",
    ["pickupLocation", "itemDescription", "goodsCapXaf"].every((k) =>
      new RegExp(`${k}: fr \\?`).test(src)
    )
  );
}

console.log("");
console.log("Walking forward is gated, and only where an empty stage would lie");
{
  check(
    "a pharmacy counts from the catalogue, the map or their own typing",
    /const havePharmacy = Boolean\(merchant \|\| pharmacyName\.trim\(\) \|\| pickupSel\)/.test(src)
  );
  check(
    "one named medicine is enough to move on",
    /const haveMedicines = meds\.some\(\(m\) => m\?\.name\?\.trim\(\)\)/.test(src)
  );
  check(
    "the bar is disabled on exactly those two stages",
    /\(stage === "pharmacy" && !havePharmacy\) \|\| \(stage === "medicines" && !haveMedicines\)/.test(src)
  );
  check(
    "only the last stage submits",
    /stage === "details" \? \(fr \? "Vérifier" : "Review"\)/.test(src) &&
      /: formRef\.current\?\.requestSubmit\(\)/.test(src)
  );
  check(
    "back walks a stage before it leaves the screen",
    /setStage\("medicines"\)[\s\S]{0,120}setStage\("pharmacy"\)[\s\S]{0,60}router\.back\(\)/.test(src)
  );
}

console.log("");
console.log("No label is drawn twice");
{
  /*
    v53 fixed exactly this on the pharmacy-location field: the card drew the
    heading and `LocationField` drew it again a line below. Splitting the form
    surfaced the same pair on the delivery address.
  */
  const fields = src.match(/<LocationField[^>]*>/g) ?? [];
  check("both location fields exist", fields.length === 2, `${fields.length} found`);
  check(
    "and both suppress the inline label their card already draws",
    fields.every((f) => /\bhideLabel\b/.test(f)),
    fields.find((f) => !/\bhideLabel\b/.test(f))
  );
}

console.log("");
console.log(failures === 0 ? "All good." : `${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
