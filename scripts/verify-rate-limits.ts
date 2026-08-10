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
check(
  "nothing is more restricted than placing an order",
  LIMITS.order.max >= Math.max(...Object.values(LIMITS).map((l) => l.max)),
  `order is ${LIMITS.order.max}; an order is the one thing here we actively want, so it can never be the tightest door`
);
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
