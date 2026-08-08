/**
 * Proves what a drafted reply may and may not contain.
 *
 * This one is unusual among the suites here, and it is worth saying why: the
 * output is **prose a person reads before it goes anywhere**. There is no
 * whitelist to enforce, because the guard is the member of staff, not a parser.
 * A draft that says something silly is deleted; a draft is never sent by
 * itself.
 *
 * So what is provable offline is narrow, and it is exactly two things:
 *
 *  1. **The prompt carries the refusals.** Never a time, never a refund, never
 *     a figure, never the delivery code. Those are commitments the business
 *     makes, and a draft that casually promises money back is one a tired
 *     person sends at 2 AM. Asserting they are in the prompt is weak evidence —
 *     but their *absence* would be strong evidence of a bug, and that is worth
 *     catching.
 *  2. **The context cannot carry what it must never carry.** Same absolute rule
 *     as the customer assistant: the delivery OTP is not filtered out, it is
 *     never loaded, and no shape here has anywhere to put one.
 *
 * Run: npx tsx scripts/verify-reply-draft.ts
 */
import { shapeDraft } from "../src/lib/ai/replyDraft";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nA draft is a real sentence or it is nothing");
check("empty is nothing", shapeDraft({}) === null);
check("blank is nothing", shapeDraft({ reply: "   " }) === null);
check(
  "a fragment is nothing",
  shapeDraft({ reply: "Sorry!" }) === null,
  "a draft too short to be a sentence wastes a click and teaches people to stop pressing the button"
);
check(
  "a real one comes through unchanged",
  shapeDraft({ reply: "I am looking into this now and will come back to you within the hour." }) ===
    "I am looking into this now and will come back to you within the hour."
);
check(
  "surrounding whitespace is trimmed",
  shapeDraft({ reply: "   I am checking this for you right now.   " }) ===
    "I am checking this for you right now."
);
check(
  "a runaway draft is bounded",
  shapeDraft({ reply: "x".repeat(5000) })?.length === 900,
  "it has to fit a reply box somebody is going to read before sending"
);

console.log("\nThe refusals are actually in the prompt");
{
  // Read the source rather than the built module: what matters is that these
  // sentences are in the file a future edit might quietly remove them from.
  const source = require("node:fs").readFileSync("src/lib/ai/replyDraft.ts", "utf8") as string;
  const musts: [string, string][] = [
    ["a delivery time", "Never promise a delivery or arrival time"],
    ["a refund", "Never promise a refund"],
    ["a price", "Never quote a price or a fee"],
    ["the delivery code", "Never give out a delivery code"],
    ["an invented reason", "Never invent a reason"],
  ];
  for (const [label, phrase] of musts) {
    check(`it is told never to promise ${label}`, source.includes(phrase), `missing: "${phrase}"`);
  }
  check(
    "and it is told that 'a person is looking into it' is a good answer",
    source.includes("is a good reply"),
    "without this it will invent something rather than admit it does not know"
  );
}

console.log("\nAnd the context has nowhere to put a delivery code");
{
  const source = require("node:fs").readFileSync("src/lib/ai/replyDraft.ts", "utf8") as string;
  check(
    "the facts shape carries no otp field",
    // Deliberately looks for a FIELD, not the word. The module doc explains the
    // rule and naturally says "OTP" while doing so; a check that fails on the
    // prose describing a guard is a check people delete.
    !/\botp[A-Za-z]*\s*[:?]/i.test(source),
    "the rule is that it is never loaded, not that it is filtered out afterwards"
  );
  const route = require("node:fs").readFileSync(
    "src/app/api/admin/cases/[caseId]/draft/route.ts",
    "utf8"
  ) as string;
  check(
    "and the route never selects one",
    !/otpCode:\s*true/.test(route),
    "same absolute rule as the customer assistant"
  );
  check(
    "internal staff notes are excluded from the thread",
    route.includes("!m.internal"),
    "a draft quoting a private note back at the customer would be a real leak"
  );
  check(
    "the language comes from the customer, not the browser",
    route.includes('preferredLanguage === "FR"'),
    "a dispatcher's screen language says nothing about what the customer wrote in"
  );
}

console.log(
  `\n${failures === 0 ? "It drafts, a person sends, and it promises nothing." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
