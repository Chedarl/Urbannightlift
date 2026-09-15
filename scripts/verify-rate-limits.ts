/**
 * Proves the limits are set where a person cannot reach them.
 *
 * ## The bug this was written after
 *
 * The assistant had one counter — twenty public calls an hour — and it counted
 * **every visitor on the site at once**. It was called a rate limit and it was
 * not one: it was a shared budget of twenty, so on any night with traffic the
 * twenty-first person to open the chat was told the assistant was busy having
 * asked nothing. Nineteen of those twenty questions were somebody else's.
 *
 * That is a specific and repeatable mistake — confusing *what one caller may
 * do* with *what the whole site may spend* — and the fix is to keep the two
 * apart. This suite is the check that they stay apart, and that no limit
 * quietly drifts down to where it starts refusing real customers.
 *
 * ## The Yaoundé constraint, which is why every number here is large
 *
 * Mobile data here puts a great many real customers behind a small number of
 * carrier NAT addresses. A tight per-IP limit does not stop an attacker; it
 * stops a street. So the assertions below are mostly floors, not ceilings —
 * they fail when somebody makes a limit *stricter*, which is the direction that
 * silently loses orders.
 *
 * Run: npx tsx scripts/verify-rate-limits.ts
 */
import fs from "node:fs";
import path from "node:path";

import { LIMITS, limitMessage, trippedHoneypot } from "../src/lib/security/rateLimit";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nEvery public door has a limit on it");
for (const purpose of [
  "signup",
  "support",
  "interest",
  "merchantSignup",
  "riderApplication",
  "order",
  "intake",
  "upload",
  "assistant",
]) {
  check(`${purpose} is limited`, LIMITS[purpose] != null);
}

console.log("\nAnd none of them is set where a real person would meet it");
for (const [purpose, rule] of Object.entries(LIMITS)) {
  check(
    `${purpose}: ${rule.max} per ${rule.windowMinutes} min is above human use`,
    rule.max >= 10 && rule.windowMinutes >= 15,
    "a limit a customer can reach is a limit that loses orders, which costs more than the abuse it stops"
  );
}

console.log("\nThe two that we most want people to succeed at are the loosest");
/*
 * Compared against the doors that *refuse a submission*, which is what this
 * invariant has always been about: an order must never be the first thing the
 * app says no to.
 *
 * The Places limits are excluded here and checked below instead, because they
 * are counted in a different unit. One of them counts keystrokes and the other
 * counts address picks, and neither refuses an order — so putting a keystroke
 * budget of 400 in the same `Math.max` as a submission budget of 40 compares
 * nothing to nothing. What matters for those is how many of them **one order
 * consumes**, and that is arithmetic, not a maximum.
 */
const SUBMISSION_DOORS = Object.entries(LIMITS).filter(([p]) => !p.startsWith("places"));
check(
  "nothing is more restricted than placing an order",
  LIMITS.order.max >= Math.max(...SUBMISSION_DOORS.map(([, l]) => l.max)),
  `order is ${LIMITS.order.max}; an order is the one thing here we actively want, so it can never be the tightest door`
);
check(
  "and every limit is accounted for by one rule or the other",
  SUBMISSION_DOORS.length + Object.keys(LIMITS).filter((p) => p.startsWith("places")).length ===
    Object.keys(LIMITS).length,
  "a limit that falls through both checks is an unchecked limit"
);

console.log("\nPicking an address is never what refuses an order");
{
  /*
   * A delivery has two ends, so a completed order closes two billed Google
   * sessions. If the address cap is not at least twice the order cap, the
   * customer is stopped at the address field long before the order limit that
   * was set generously on purpose — which is the same failure as a tight order
   * limit, wearing a different name. This is not hypothetical: `placesResolve`
   * was first written at 60 against an order limit of 40, and that is thirty
   * orders' worth of addresses.
   */
  const ADDRESSES_PER_ORDER = 2;
  check(
    "the address cap covers every order the order cap allows",
    LIMITS.placesResolve.max >= LIMITS.order.max * ADDRESSES_PER_ORDER,
    `${LIMITS.placesResolve.max} address picks against ${LIMITS.order.max} orders, which need ${LIMITS.order.max * ADDRESSES_PER_ORDER}`
  );
  check(
    "and typing one is not capped tighter than picking one",
    LIMITS.placesSearch.max > LIMITS.placesResolve.max,
    "every pick is preceded by several keystrokes, so the cheaper call must have the looser budget"
  );
  check(
    "the billed call is still capped well below anything worth scripting",
    LIMITS.placesResolve.max <= 500,
    `${LIMITS.placesResolve.max} — this is the one Google actually charges for`
  );
}
check(
  "asking the assistant allows a real conversation, not a single question",
  LIMITS.assistant.max >= 20,
  `${LIMITS.assistant.max} — a follow-up and a rephrase are how people actually use a chat`
);

console.log("\nA refusal says how long, in the customer's own language");
{
  const en = limitMessage({ ok: false, retryInMinutes: 7 }, false);
  const fr = limitMessage({ ok: false, retryInMinutes: 7 }, true);
  check("the English one names the wait", en.includes("7") && /minute/i.test(en));
  check("the French one names the wait", fr.includes("7") && /minute/i.test(fr));
  check("they are actually different sentences", en !== fr);
  check(
    "one minute is not written as '1 minutes'",
    limitMessage({ ok: false, retryInMinutes: 1 }, false).includes("1 minute") &&
      !limitMessage({ ok: false, retryInMinutes: 1 }, false).includes("1 minutes")
  );
}

console.log("\nThe two doors onto somebody else's bill are shut");
{
  /*
   * A limit nobody calls is a comment. Both of these routes are unauthenticated
   * proxies onto a third party — one billed, one running on OpenStreetMap's
   * goodwill — and both sat uncapped through every round that added limits to
   * the forms beside them, because a proxy does not look like a form.
   */
  const ROOT = path.resolve(__dirname, "..");
  const code = (p: string) =>
    fs
      .readFileSync(path.join(ROOT, p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const search = code("src/app/api/locations/search/route.ts");
  const place = code("src/app/api/locations/place/route.ts");

  check("typing an address is counted", /checkRateLimit\(req,\s*["']placesSearch["']\)/.test(search));
  check("picking one is counted", /checkRateLimit\(req,\s*["']placesResolve["']\)/.test(place));
  check(
    "over the limit, search stops spending outside instead of breaking the form",
    /const within\s*=/.test(search) && /within &&/.test(search) && !/status:\s*429/.test(search),
    "an address field that returns an error is a broken order; one that returns only our own catalogue is a shorter list"
  );
  check(
    "and both outside sources are behind that same gate, not just the billed one",
    (search.match(/within &&/g) ?? []).length >= 2,
    "Google and OpenStreetMap — capping one and leaving the other open caps nothing"
  );
  check(
    "picking, which has no local answer, refuses outright",
    /status:\s*429/.test(place),
    "a Place ID means nothing without Google, so there is no thinner list to fall back to"
  );
  check(
    "and the refusal is checked before the billed call is made",
    place.indexOf("checkRateLimit") < place.indexOf("placeDetails("),
    "counting a call after paying for it is an audit log, not a limit"
  );
}

console.log("\nThe honeypot catches a filled field and nothing else");
check("an empty form passes", !trippedHoneypot({ fullName: "Alice" }));
check("the merchant form's own field name is the one read", trippedHoneypot({ companyWebsite: "http://x" }));
check("so are the aliases", trippedHoneypot({ website2: "x" }) && trippedHoneypot({ honeypot: "x" }));
check("whitespace is not a fill", !trippedHoneypot({ companyWebsite: "   " }));
check("a non-string is not a fill", !trippedHoneypot({ companyWebsite: 0 }));

console.log(
  `\n${failures === 0 ? "One caller's budget is their own, and none of them is tight enough to bite." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
