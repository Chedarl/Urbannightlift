/**
 * Proves the shape guard, which is the only thing standing between a model's
 * answer and code that trusts it.
 *
 * `response_format: json_schema` asks Moonshot to constrain the output. That is
 * a request, not a guarantee, and the failure it does not cover is the
 * dangerous one: a *plausible* object with a field missing or a number arriving
 * as prose. Every caller in this product feeds an address resolver, a money
 * screen or an order draft, and each of those is far worse off with a
 * half-right object than with nothing at all.
 *
 * So `matchesSchema` is checked here against the mistakes that actually happen,
 * rather than assumed to work because it looked right when it was written.
 *
 * Run: npx tsx scripts/verify-kimi-schema.ts
 */
import { matchesSchema, type JsonSchema } from "../src/lib/ai/kimi";

let failures = 0;
function check(name: string, actual: boolean, expected: boolean) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `  (expected ${expected}, got ${actual})`}`);
}

/** The shape the address resolver asks for — the highest-stakes one. */
const ADDRESS: JsonSchema = {
  type: "object",
  required: ["matchedId", "confidence"],
  properties: {
    matchedId: { type: "string" },
    confidence: { type: "number" },
    landmark: { type: "string" },
    area: { type: "string" },
  },
};

/** The receipt reader — this one decides whether money gets flagged. */
const RECEIPT: JsonSchema = {
  type: "object",
  required: ["totalXaf", "items"],
  properties: {
    totalXaf: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, priceXaf: { type: "number" } },
      },
    },
  },
};

console.log("\nAccepts what it should");
check("a complete answer", matchesSchema({ matchedId: "loc_1", confidence: 0.8 }, ADDRESS), true);
check(
  "optional fields present",
  matchesSchema({ matchedId: "loc_1", confidence: 0.8, landmark: "Total", area: "Nsam" }, ADDRESS),
  true
);
// The model saying "I could not match this" is a real, useful answer and must
// not be thrown away as malformed.
check("an explicit null on an optional field", matchesSchema({ matchedId: "x", confidence: 0, landmark: null }, ADDRESS), true);
check(
  "nested arrays of objects",
  matchesSchema({ totalXaf: 5000, items: [{ name: "Poulet", priceXaf: 2500 }, { name: "Riz" }] }, RECEIPT),
  true
);
check("an empty array", matchesSchema({ totalXaf: 0, items: [] }, RECEIPT), true);

console.log("\nRefuses the mistakes that actually happen");
// The plausible-but-wrong answers. Each of these would previously have reached
// a caller and been treated as a real result.
check("a missing required field", matchesSchema({ confidence: 0.8 }, ADDRESS), false);
check("a number arriving as prose", matchesSchema({ matchedId: "x", confidence: "high" }, ADDRESS), false);
check("a string where a number belongs", matchesSchema({ totalXaf: "5,000 XAF", items: [] }, RECEIPT), false);
check("an object where an array belongs", matchesSchema({ totalXaf: 1, items: { name: "x" } }, RECEIPT), false);
check("a malformed row inside a good array", matchesSchema({ totalXaf: 1, items: [{ priceXaf: 5 }] }, RECEIPT), false);
check("an array where an object belongs", matchesSchema([{ matchedId: "x", confidence: 1 }], ADDRESS), false);
check("null instead of an answer", matchesSchema(null, ADDRESS), false);
check("a bare string", matchesSchema("loc_1", ADDRESS), false);
check("a number", matchesSchema(42, ADDRESS), false);

console.log("\nExtra keys are tolerated");
// Models add commentary fields. Rejecting an otherwise-correct answer because
// it explained itself would throw away good results for no gain.
check(
  "a helpful extra field",
  matchesSchema({ matchedId: "x", confidence: 0.9, reasoning: "matches the Total station" }, ADDRESS),
  true
);

console.log(
  `\n${failures === 0 ? "A half-right answer cannot reach a caller." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
