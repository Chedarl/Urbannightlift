/**
 * Proves the part of the safety flag that actually decides.
 *
 * The model returns an opinion; `shapeVerdict` decides whether that opinion is
 * allowed to put a red row in front of a dispatcher. That is the whole surface
 * worth proving, and it is provable offline — which matters, because the model
 * half can only ever be judged against real orders.
 *
 * Three properties, and each has a failure that costs something real:
 *
 *  1. **No concern means no mark.** A model that pads its answer with a reason
 *     while saying `concern: false` must not flag anything. Getting this wrong
 *     flags every order, and a panel that cries wolf every night is one people
 *     stop reading — which costs more than never having built it.
 *  2. **A flag always carries a sentence.** A red row with nothing to read
 *     tells a dispatcher an order is frightening and nothing about why, which
 *     is worse than silence.
 *  3. **A category is one of ours or it is OTHER.** A model inventing
 *     "TERRORISM" and having it rendered verbatim would put a word on a
 *     customer's order that nobody here chose.
 *
 * Run: npx tsx scripts/verify-moderation.ts
 */
import { shapeVerdict, SAFETY_LABEL } from "../src/lib/ai/moderation";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nSilence is the normal answer, and stays silent");
check("no concern is no flag", shapeVerdict({ concern: false }) === null);
check("a missing verdict is no flag", shapeVerdict({}) === null);
check(
  "no concern wins even when the model padded a reason",
  shapeVerdict({ concern: false, category: "WEAPON", reason: "mentions a kitchen knife" }) === null,
  "a model that explains itself while saying no must not be read as saying yes"
);
check(
  "a truthy-looking non-true is not a concern",
  shapeVerdict({ concern: "yes" as unknown as boolean }) === null,
  "strict equality, so a string never becomes a red row"
);

console.log("\nA flag always carries something to read");
check(
  "a concern with no reason is dropped",
  shapeVerdict({ concern: true, category: "WEAPON" }) === null,
  "a red row that says nothing tells a dispatcher to be afraid and not why"
);
check("a one-word reason is dropped", shapeVerdict({ concern: true, reason: "bad" }) === null);
check(
  "a real one comes through",
  shapeVerdict({ concern: true, category: "HAZARD", reason: "asks for a petrol canister" })?.reason ===
    "asks for a petrol canister"
);

console.log("\nThe category is one of ours, or it is OTHER");
for (const c of ["WEAPON", "DRUG", "STOLEN", "LIVE_ANIMAL", "HAZARD", "PERSON_AT_RISK", "OTHER"]) {
  check(
    `${c} survives`,
    shapeVerdict({ concern: true, category: c, reason: "a good enough reason here" })?.category === c
  );
}
check(
  "lower case is accepted",
  shapeVerdict({ concern: true, category: "hazard", reason: "a good enough reason here" })?.category ===
    "HAZARD"
);
check(
  "an invented category becomes OTHER",
  shapeVerdict({ concern: true, category: "TERRORISM", reason: "a good enough reason here" })
    ?.category === "OTHER",
  "a word nobody here chose must never be rendered on a customer's order"
);
check(
  "a missing category becomes OTHER",
  shapeVerdict({ concern: true, reason: "a good enough reason here" })?.category === "OTHER"
);

console.log("\nAnd every category has words for the panel");
check(
  "no category can render as a raw enum",
  Object.values(SAFETY_LABEL).every((v) => v.length > 3 && v !== v.toUpperCase()),
  "a dispatcher should read English, not LIVE_ANIMAL"
);
check(
  "a reason cannot run away with the panel",
  (shapeVerdict({ concern: true, reason: "x".repeat(900) })?.reason.length ?? 0) === 200
);

console.log(
  `\n${failures === 0 ? "It points, it never judges, and it stays quiet by default." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
