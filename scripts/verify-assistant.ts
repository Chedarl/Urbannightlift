/**
 * Proves the assistant cannot say or do the things it must never say or do.
 *
 * A customer-facing model is the riskiest thing in this product, and the risk is
 * not that it writes something clumsy — it is that it hands a stranger somebody
 * else's delivery. The owner chose to put it on the public site, which makes the
 * signed-out case the one that has to be airtight.
 *
 * Two ideas carry the whole design and both are checked here:
 *
 *  1. **A rule in a prompt is a request; leaving data out is a fact.** The
 *     delivery OTP is not forbidden to the model, it is never given to it. So
 *     the test is not "does it refuse" — it is "is the code anywhere in what we
 *     built", for every audience.
 *  2. **The model proposes, the code disposes.** Every action it can suggest is
 *     checked against a scope assembled from the session. An order code it
 *     invented, or one belonging to somebody else, is discarded before a button
 *     is ever drawn.
 *
 * Run: npx tsx scripts/verify-assistant.ts
 */
import { acceptActions, actionHref, ACTION_KINDS } from "../src/lib/ai/assistant/actions";
import { systemPrompt, type AssistantFacts } from "../src/lib/ai/assistant/context";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const OTP = "704912";

const BASE: AssistantFacts = {
  fr: false,
  signedIn: true,
  firstName: "Erine",
  hoursText: "6:00 PM to 4:00 AM",
  openNow: true,
  services: [{ type: "FOOD_PICKUP", label: "Food" }],
  fees: [{ zone: "Biyem-Assi", feeText: "1,500 XAF" }],
  orders: [
    { orderCode: "UNL-4821", service: "Food", status: "on the way", placedAt: "tonight", totalText: "1,500 XAF" },
  ],
  places: [{ id: "addr-1", label: "Home" }],
  openMerchants: [{ name: "Chez Maman Josephine", category: "FOOD", neighbourhood: "Biyem-Assi" }],
};

console.log("\nThe delivery code is not in the room");
for (const [who, facts] of [
  ["signed in", BASE],
  ["signed out", { ...BASE, signedIn: false, orders: [], places: [], firstName: null }],
  ["no orders", { ...BASE, orders: [] }],
] as const) {
  const prompt = systemPrompt(facts as AssistantFacts);
  check(
    `${who}: the OTP appears nowhere in the context`,
    !prompt.includes(OTP),
    "the code is never selected, never passed and never mentioned — a rule it could break is not good enough here"
  );
}

console.log("\nA stranger's world contains no orders");
const strangerPrompt = systemPrompt({ ...BASE, signedIn: false, orders: [], places: [], firstName: null });
check("no order code", !strangerPrompt.includes("UNL-4821"));
check("no saved place", !strangerPrompt.includes("addr-1"));
check("no name", !strangerPrompt.includes("Erine"));
check(
  "and it is told plainly that it has none",
  /not signed in/i.test(strangerPrompt) && /must not pretend/i.test(strangerPrompt)
);
check(
  "but hours, fees and what is open still reach it",
  strangerPrompt.includes("6:00 PM to 4:00 AM") &&
    strangerPrompt.includes("1,500 XAF") &&
    strangerPrompt.includes("Chez Maman Josephine"),
  "a public assistant that knows nothing useful is just a worse help page"
);

console.log("\nThe rules that cost money if they slip");
const signedIn = systemPrompt(BASE);
for (const [name, pattern] of [
  ["never invent an arrival time", /never invent an arrival time/i],
  ["never invent a price", /never invent a price/i],
  ["never give out a delivery code", /never give out a delivery code/i],
  ["never discuss another person's order", /never discuss anybody's order but the one asking/i],
  ["saying 'I am not sure' is allowed", /not sure/i],
] as const) {
  check(name, pattern.test(signedIn));
}
check(
  "fees are handed over pre-formatted",
  signedIn.includes("1,500 XAF"),
  "the model quotes a string we computed; it is never asked to do arithmetic about money"
);

console.log("\nActions: the model proposes, the scope disposes");
const scope = {
  orderCodes: ["UNL-4821"],
  addressIds: ["addr-1"],
  services: ["FOOD_PICKUP"],
  signedIn: true,
};

const good = acceptActions(
  [
    { kind: "TRACK_ORDER", ref: "UNL-4821", label: "Track it" },
    { kind: "DELIVER_TO_SAVED", ref: "addr-1", label: "Deliver home" },
    { kind: "START_SERVICE", ref: "FOOD_PICKUP", label: "Order food" },
    { kind: "OPEN_CASE", label: "Talk to a person" },
  ],
  scope
);
check("the four legitimate ones survive", good.length === 4, `got ${good.length}`);
check("an order code is normalised", good[0].ref === "UNL-4821");

console.log("\nWhat must never reach a button");
check(
  "somebody else's order code is discarded",
  acceptActions([{ kind: "TRACK_ORDER", ref: "UNL-9999", label: "Track it" }], scope).length === 0,
  "this is the serious one — a plausible code in a Track button is another customer's delivery"
);
check(
  "an address that is not theirs is discarded",
  acceptActions([{ kind: "DELIVER_TO_SAVED", ref: "addr-999", label: "Home" }], scope).length === 0
);
check(
  "a service that is switched off is discarded",
  acceptActions([{ kind: "START_SERVICE", ref: "URGENT_ITEM", label: "Urgent" }], scope).length === 0,
  "offering a paused service is a promise the product cannot keep"
);
check(
  "a capability it invented is discarded",
  acceptActions(
    [
      { kind: "CANCEL_ORDER", ref: "UNL-4821", label: "Cancel it" },
      { kind: "REFUND", ref: "UNL-4821", label: "Refund me" },
    ],
    scope
  ).length === 0,
  "a button for something this app cannot do is a promise nothing here can keep"
);
check(
  "a signed-out visitor cannot open a case against an account",
  acceptActions([{ kind: "OPEN_CASE", label: "Help" }], { ...scope, signedIn: false }).length === 0
);
check(
  "an action with no label is dropped rather than drawn blank",
  acceptActions([{ kind: "SHOW_OPEN_NOW", label: "" }], scope).length === 0
);
check("junk is not an action", acceptActions(["hello", 42, null], scope).length === 0);
check("a non-array is not actions", acceptActions("TRACK_ORDER", scope).length === 0);
check(
  "the same action twice becomes one",
  acceptActions(
    [
      { kind: "SHOW_OPEN_NOW", label: "What's open" },
      { kind: "SHOW_OPEN_NOW", label: "Open now" },
    ],
    scope
  ).length === 1
);
check(
  "a wall of buttons is capped at four",
  acceptActions(
    Array.from({ length: 9 }, (_, i) => ({ kind: "START_SERVICE", ref: "FOOD_PICKUP", label: `x${i}` })),
    scope
  ).length <= 4
);

console.log("\nEvery action goes somewhere that already exists");
for (const kind of ACTION_KINDS) {
  const href = actionHref({ kind, ref: kind === "TRACK_ORDER" ? "UNL-4821" : "addr-1", label: "x" });
  check(`${kind} has a route`, href.startsWith("/") && !href.includes("undefined"), href);
}

console.log(
  `\n${failures === 0 ? "It cannot leak an order, and it cannot press a button." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
