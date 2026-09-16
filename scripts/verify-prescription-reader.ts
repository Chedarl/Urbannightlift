/**
 * Proves the prescription reader cannot invent a prescription.
 *
 * ## What this guards
 *
 * A customer photographs a doctor's note, and a model reads drug names out of
 * handwriting into the list a dispatcher reads aloud to a pharmacist. Every
 * other AI read in this codebase fails softly into a blank field. This one
 * fails into a **medical instruction**, which is why it gets its own suite.
 *
 * The code this was adapted from — `PrescriptionAiScanner`, sent by the owner —
 * catches an API failure and substitutes a named doctor and two specific drugs:
 * *Dr. M. Ebanda*, *Amoxicilline + Acide Clavulanique 1g*, *Doliprane 1000mg*.
 * On a delivery app that is a fabricated prescription attached to a real order,
 * dialled by a dispatcher and carried to a counter. It is the single thing this
 * file exists to make impossible, and the last check below proves the detector
 * would actually catch it rather than merely passing on today's clean code.
 *
 * ## The four rules
 *
 * 1. **A failed reading returns nothing.** No key, unreadable photo, timeout,
 *    provider error, empty result — all five return `none` with a reason.
 * 2. **No medicine is named in any code path that builds a row.** The system
 *    prompt names Cameroonian brands on purpose, as spelling hints for a
 *    transcriber; nothing outside it may name a drug.
 * 3. **Nothing enters the medicine list without the confirmation tick**, and
 *    the tick is reset by any edit to the rows.
 * 4. **The reading writes only into the list that already existed.** The shared
 *    order PDF prints `serviceDetails.meds`; it must gain no new field, and the
 *    doctor's directions must not be relayed at all.
 *
 * Run: npx tsx scripts/verify-prescription-reader.ts
 */

import fs from "node:fs";
import path from "node:path";

import { readPrescriptionPhoto } from "../src/lib/ai/prescriptionPhoto";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Comments stripped — these files argue at length for the rules they are checked against. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const READER = "src/lib/ai/prescriptionPhoto.ts";
const ROUTE = "src/app/api/ai/prescription/route.ts";
const PANEL = "src/components/customer/pharmacy/PrescriptionReader.tsx";
const FORM = "src/components/customer/order/forms/MedicineForm.tsx";
const PDF = "src/components/customer/order/orderPdf.tsx";

/**
 * The names the fallback we refused would have produced, plus the shapes any
 * other fabricated one would take. Used against the real files and, at the end,
 * against a reinstated copy of that fallback, so the list is known to have
 * teeth rather than merely to be silent.
 */
const FABRICATED =
  /Ebanda|Amoxicilline|Clavulanique|Doliprane|Efferalgan|Paracétamol|Paracetamol|Coartem|Maloxine|Smecta|Spasfon/i;

/** Everything except the transcriber's prompt, which names brands deliberately. */
function outsideThePrompt(src: string): string {
  return src.replace(/const SYSTEM =[\s\S]*?`;/, "const SYSTEM = ``;");
}

/** The body of one named function, to the closing brace at its own indent. */
function body(src: string, signature: string): string {
  const at = src.indexOf(signature);
  if (at < 0) return "";
  const rest = src.slice(at);
  const end = rest.search(/\n  \}/);
  return end < 0 ? rest : rest.slice(0, end);
}

async function main() {
console.log("A failed reading returns nothing, never a prescription");
{
  const src = code(READER);
  const outside = outsideThePrompt(src);

  check(
    "the module is server-only",
    /^import "server-only";/m.test(read(READER))
  );
  check(
    "every failure has its own reason",
    (src.match(/\bnone\(/g) ?? []).length >= 5,
    `${(src.match(/\bnone\(/g) ?? []).length} none() calls; expected one each for no key, unreadable file, no answer, unreadable photo and an empty result`
  );
  check(
    "there is exactly one success path and it returns what was read",
    (src.match(/\bgot\(/g) ?? []).length === 1 && /return got\(items\);/.test(src)
  );
  check(
    "an empty reading is a failure, not an empty success",
    /items\.length === 0[\s\S]{0,120}return none\(/.test(src)
  );
  check(
    "no medicine is named outside the transcriber's prompt",
    !FABRICATED.test(outside),
    outside.match(FABRICATED)?.[0]
  );
  check(
    "no row is ever built from a literal name",
    !/\bname:\s*["'`]/.test(src)
  );
  check(
    "the prompt forbids transcribing the patient, the doctor or the clinic",
    /Do not transcribe the patient's name, the doctor's name, the clinic/.test(read(READER))
  );
  check(
    "an unreadable photo is answered differently from a provider error",
    /readable === false/.test(src)
  );
}

console.log("");
console.log("The reading actually fails closed");
{
  // No key is configured in a verification run, which is the cheapest of the
  // five failures to reach and the one a fallback would most obviously paper
  // over: this is the exact call that returned a named doctor in the original.
  const result = await readPrescriptionPhoto(null);
  check("no key configured yields no data", result.data === null, JSON.stringify(result.data));
  check("and says why", typeof result.error === "string" && result.error.length > 0, String(result.error));
  check(
    "the reason names no medicine",
    !FABRICATED.test(String(result.error)),
    String(result.error)
  );
}

console.log("");
console.log("The route publishes nothing and is limited like an upload");
{
  const src = code(ROUTE);

  check("it is rate limited on the upload class", /checkRateLimit\(req, "upload"\)/.test(src));
  check("and answers 429 when that is spent", /status: 429/.test(src));
  check(
    "a failed read returns an empty list with the reason",
    /return NextResponse\.json\(\{ items: \[\], note: error/.test(src)
  );
  check("it names no medicine", !FABRICATED.test(src), src.match(FABRICATED)?.[0]);
  check(
    "it writes nothing",
    !/prisma\.|createMany|\.create\(|\.update\(/.test(src)
  );
}

console.log("");
console.log("Nothing enters the list without the customer's tick");
{
  const src = code(PANEL);

  check(
    "the add button is disabled until the box is ticked",
    /disabled=\{!checked/.test(src)
  );
  check(
    "onAdd is called once, inside that button",
    (src.match(/onAdd\(/g) ?? []).length === 1
  );
  check(
    "editing a row takes the tick back",
    /function edit\([\s\S]{0,400}?setChecked\(false\)/.test(src)
  );
  check(
    "removing a row takes the tick back",
    /function drop\([\s\S]{0,200}?setChecked\(false\)/.test(src)
  );
  check(
    "a failed request shows nothing rather than something plausible",
    /catch \{[\s\S]{0,400}?setRows\(null\)/.test(src)
  );
  check(
    "it names no medicine",
    !FABRICATED.test(src),
    src.match(FABRICATED)?.[0]
  );
  check(
    "it says the pharmacist still decides",
    /pharmacist, who alone decides what is dispensed/.test(read(PANEL))
  );
  check(
    "it offers no clinical opinion",
    !/interaction|contraindicat|instead of|recommend/i.test(src)
  );
}

console.log("");
console.log("It writes only into the list the PDF already printed");
{
  const src = code(FORM);
  const handler = body(src, "function addReadMedicines(");

  check("the reader is wired to the form", /onAdd=\{addReadMedicines\}/.test(src));
  check("and reads the file that was already uploaded", /photoPath=\{watch\("screenshotUrl"\)/.test(src));
  check("the handler exists", handler.length > 0);
  check(
    "it sets no field of its own anywhere on the order",
    handler.length > 0 && !/setValue\(/.test(handler)
  );
  check(
    "it writes through the medicine field array and nothing else",
    /\breplace\(\[\.\.\.existing, \.\.\.added\]/.test(handler)
  );
  check(
    "the doctor's directions are not relayed",
    handler.length > 0 && !/r\.dosage/.test(handler)
  );
  check(
    "it names no medicine",
    !FABRICATED.test(handler),
    handler.match(FABRICATED)?.[0]
  );
  check(
    "the uploaded prescription still never reaches the shared PDF",
    !/screenshotUrl/.test(code(PDF))
  );
  check(
    "and the PDF's medicine rows are the same three fields as before",
    /list\(sd\.meds, \(o\) => \(o\.name \? `• \$\{o\.qty \|\| 1\}× \$\{o\.name\}\$\{o\.dosage/.test(code(PDF))
  );
}

console.log("");
console.log("The detector would catch the fallback we refused");
{
  /*
    Without this, every check above passes just as happily against a file that
    never had a fallback to begin with — which proves nothing about whether one
    could be reinstated. This is the original, verbatim in shape, run through
    the same three tests the real files face.
  */
  const reinstated = `
    } catch (err) {
      console.error(err);
      return {
        doctorName: "Dr. M. Ebanda",
        items: [
          { name: "Amoxicilline + Acide Clavulanique", strength: "1g" },
          { name: "Doliprane", strength: "1000mg" },
        ],
      };
    }`;

  check("a reinstated fallback names a medicine", FABRICATED.test(reinstated));
  check("and builds a row from a literal name", /\bname:\s*["'`]/.test(reinstated));
  check(
    "and would therefore fail the module check above",
    FABRICATED.test(outsideThePrompt(reinstated)) || /\bname:\s*["'`]/.test(reinstated)
  );
}

console.log("");
console.log(failures === 0 ? "All good." : `${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
}

main();
