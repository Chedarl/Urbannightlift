/**
 * Proves the receipt comparison, because it decides when somebody is asked to
 * look at a money discrepancy — and both ways of getting it wrong are costly.
 *
 * Too sensitive and the attention queue fills with badly-lit photographs, which
 * is how a queue stops being read at all. Too lax and a missing zero reaches a
 * customer's bill.
 *
 * The case this most exists for is the one that reads backwards at first: a
 * receipt showing MORE than the rider typed is a problem for the **rider**,
 * who is out of pocket by the difference. Getting that direction right in the
 * message is most of the value.
 *
 * Run: npx tsx scripts/verify-receipt-check.ts
 */
import { checkReceipt, describeCheck, TOLERANCE_XAF } from "../src/lib/orders/receiptCheck";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nAgreement is silent");
check("an exact match", checkReceipt(5000, 5000).verdict === "agrees");
check("nobody is interrupted for it", checkReceipt(5000, 5000).needsLook === false);
// A thermal receipt photographed in a dark street is genuinely hard to read.
check("within the flat tolerance", checkReceipt(5000, 5000 + TOLERANCE_XAF).verdict === "agrees");
check("within the percentage on a big shop", checkReceipt(50_000, 50_900).verdict === "agrees");

console.log("\nA real difference is raised");
const missingZero = checkReceipt(450, 4500);
check("a missing zero is caught", missingZero.verdict === "differs");
check("and somebody is asked to look", missingZero.needsLook === true);
check("a 1,000 XAF gap is caught", checkReceipt(5000, 6000).verdict === "differs");
check(
  "just outside the tolerance is caught",
  checkReceipt(5000, 5000 + TOLERANCE_XAF + 1).verdict === "differs"
);

console.log("\nUnreadable is not the same as wrong");
// This distinction is the whole reason the queue stays usable: "we could not
// check" must never look like "the numbers disagree".
for (const [label, read] of [
  ["no key configured, so nothing was read", null],
  ["the model returned zero", 0],
  ["the model returned nonsense", NaN],
] as const) {
  const c = checkReceipt(5000, read);
  check(`${label} → unreadable`, c.verdict === "unreadable");
  check(`${label} → nobody is interrupted`, c.needsLook === false);
}
check("no amount typed yet", checkReceipt(null, 5000).verdict === "unreadable");

console.log("\nThe message says who is affected, and which way");
// Getting this backwards would send a dispatcher after the wrong problem.
const riderShort = describeCheck(checkReceipt(4000, 5000), 4000);
check("receipt higher → the rider is out of pocket", /rider may be out of pocket/i.test(riderShort), riderShort);
check("and it says MORE", /MORE/.test(riderShort));

const customerOver = describeCheck(checkReceipt(5000, 4000), 5000);
check(
  "receipt lower → the customer may be overcharged",
  /customer may be about to be overcharged/i.test(customerOver),
  customerOver
);
check("and it says LESS", /LESS/.test(customerOver));

check(
  "unreadable says nothing is wrong",
  /nothing is wrong/i.test(describeCheck(checkReceipt(5000, null), 5000))
);

console.log("\nNothing here changes an amount");
// The module has no way to: it returns a verdict and a sentence, and the only
// numbers it produces are differences.
const c = checkReceipt(5000, 9000);
check("it reports a difference and nothing else", c.deltaXaf === 4000 && Object.keys(c).length === 3);

console.log(
  `\n${failures === 0 ? "A disagreement raises a question, and never moves money." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
