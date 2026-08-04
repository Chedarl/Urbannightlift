/**
 * Proves the two guarantees that make it safe to let a model near an address.
 *
 * A wrong pin is not a cosmetic failure here. It sends a motorbike rider to the
 * wrong door in the dark, and the customer waits for a delivery that is
 * somewhere else — which is the exact failure the whole address stack exists to
 * avoid, and why our own catalogue outranks every third party in it.
 *
 * So two properties are checked rather than trusted:
 *
 *   1. **It can only pick a place we already hold.** An id we never offered is
 *      discarded. This is what makes "the model cannot invent a location" a fact
 *      about the code rather than a hope about the prompt.
 *   2. **Its confidence cannot outrank ours.** Capped below a delivered place
 *      and below a strong catalogue hit, however sure it claims to be.
 *
 * Run: npx tsx scripts/verify-ai-address.ts
 */
import { acceptAnswer, shortlist, AI_CONFIDENCE_CAP } from "../src/lib/locations/aiResolve";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const KNOWN = new Set(["loc_total_express", "loc_nsam", "loc_biyem_assi"]);

console.log("\nIt can only choose a place we offered it");
check(
  "an id from the list is accepted",
  acceptAnswer({ matchedId: "loc_nsam", confidence: 0.6 }, KNOWN).locationId === "loc_nsam"
);
check(
  "an invented id is discarded",
  acceptAnswer({ matchedId: "loc_somewhere_else", confidence: 0.9 }, KNOWN).locationId === null,
  "a hallucinated id would have been looked up as if it were real"
);
check(
  "a real-looking cuid it made up is discarded",
  acceptAnswer({ matchedId: "cmabc123def456", confidence: 0.95 }, KNOWN).locationId === null
);
check(
  "an empty answer means no match, not an error",
  acceptAnswer({ matchedId: "", confidence: 0 }, KNOWN).locationId === null
);
check(
  "whitespace is not an id",
  acceptAnswer({ matchedId: "   ", confidence: 0.8 }, KNOWN).locationId === null
);
check(
  "an id that is right but padded still works",
  acceptAnswer({ matchedId: " loc_nsam ", confidence: 0.5 }, KNOWN).locationId === "loc_nsam"
);

console.log("\nIts confidence can never outrank ours");
// A delivered place is 0.9–0.99 and a strong catalogue hit up to 0.95. Whatever
// the model claims, it must lose to both.
check(
  "a claimed 0.99 is capped",
  acceptAnswer({ matchedId: "loc_nsam", confidence: 0.99 }, KNOWN).confidence === AI_CONFIDENCE_CAP
);
check("the cap is below a delivered place (0.9)", AI_CONFIDENCE_CAP < 0.9);
check("the cap is below a strong catalogue hit (0.95)", AI_CONFIDENCE_CAP < 0.95);
check(
  "a negative confidence becomes zero",
  acceptAnswer({ matchedId: "loc_nsam", confidence: -3 }, KNOWN).confidence === 0
);
check(
  "a missing confidence becomes zero, not something arbitrary",
  acceptAnswer({ matchedId: "loc_nsam", confidence: NaN }, KNOWN).confidence === 0
);
check(
  "a sensible confidence passes through",
  acceptAnswer({ matchedId: "loc_nsam", confidence: 0.55 }, KNOWN).confidence === 0.55
);

console.log("\nThe place words come back even when nothing matched");
// This is what turns a customer's whole sentence into a query OpenStreetMap can
// actually answer, so it has to survive a failed match.
const words = acceptAnswer(
  { matchedId: "", confidence: 0, landmark: " station Total ", area: "Rond-Point Express" },
  KNOWN
);
check("landmark is kept and trimmed", words.landmark === "station Total");
check("area is kept", words.area === "Rond-Point Express");
check(
  "empty strings become null rather than an empty query",
  acceptAnswer({ matchedId: "", confidence: 0, landmark: "  ", area: "" }, KNOWN).landmark === null
);

console.log("\nThe shortlist puts the plausible rows first");
const rows = [
  { id: "a", primaryName: "Marché Mokolo", aliases: [], neighbourhood: "Mokolo" },
  { id: "b", primaryName: "Rond-Point Express", aliases: ["Carrefour Express"], neighbourhood: "Biyem-Assi" },
  { id: "c", primaryName: "Carrefour Nsam", aliases: [], neighbourhood: "Nsam" },
];
const ranked = shortlist("derrière la station Total à Rond-Point Express, portail bleu", rows);
check("the place actually mentioned ranks first", ranked[0]?.id === "b", `got ${ranked[0]?.id}`);
check("nothing is dropped from a small catalogue", ranked.length === rows.length);
check(
  "text sharing no words still returns candidates rather than nothing",
  shortlist("zzz qqq", rows).length === rows.length
);

console.log(
  `\n${failures === 0 ? "It cannot invent a place, and it cannot outrank what we know." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
