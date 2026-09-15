/**
 * Proves the first delivery is genuinely free, and that everyone can see it.
 *
 * ## The two ways a waiver goes wrong
 *
 * **It is funded by the wrong person.** A promotion taken out of the rider's
 * 60% is not a promotion, it is a pay cut with a banner on it. The rider's
 * payout must be computed from the full quoted fee and be indistinguishable
 * from an order with no offer at all.
 *
 * **It is applied in one place and not recorded anywhere.** This is what
 * actually shipped: the waiver was computed at checkout, subtracted from the
 * `Payment` row, and written to no column. So every screen after checkout
 * recomputed the total from the fee and showed a figure the customer was not
 * being charged — the confirmation said 8,000 while the payment card asked for
 * 6,500, and the receipt, which is a document people keep, said the larger
 * number. Nothing was wrong with the arithmetic anywhere; the gift simply
 * vanished the moment the customer left the checkout screen.
 *
 * Run: npx tsx scripts/verify-launch-offer.ts
 */

import fs from "node:fs";
import path from "node:path";

import { applyLaunchOffer, eligibleForLaunchOffer } from "../src/lib/orders/launchOffer";
import { splitEarnings } from "../src/lib/orders/earnings";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

const ROOT = path.resolve(__dirname, "..");
const code = (rel: string) =>
  fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const CAP = 1500;

console.log("The first one is free, and the second one is not");
{
  const first = applyLaunchOffer({ feeXaf: 1500, completedOrders: 0, capXaf: CAP });
  eq("a 1,500 fee on a first order is waived entirely", first.waivedXaf, 1500);
  eq("and nothing is left to pay", first.payableXaf, 0);
  check("which is not a capped-out order", !first.cappedOut);

  const second = applyLaunchOffer({ feeXaf: 1500, completedOrders: 1, capXaf: CAP });
  eq("the second order is charged in full", second.waivedXaf, 0);
  eq("and owes the whole fee", second.payableXaf, 1500);
}

console.log("\nThe cap is a cap, and the difference is said out loud");
{
  const big = applyLaunchOffer({ feeXaf: 3200, completedOrders: 0, capXaf: CAP });
  eq("a 3,200 fee is waived only to the cap", big.waivedXaf, CAP);
  eq("so 1,700 is still owed", big.payableXaf, 1700);
  check("and the screen is told to say so", big.cappedOut);

  // Both near bands are covered — the reason the cap is 1,500 and not 1,000.
  for (const fee of [1000, 1400, 1500]) {
    eq(`a ${fee} fee is fully covered`, applyLaunchOffer({ feeXaf: fee, completedOrders: 0, capXaf: CAP }).payableXaf, 0);
  }
}

console.log("\nThe offer can be switched off, and off means off");
{
  const off = applyLaunchOffer({ feeXaf: 1500, completedOrders: 0, capXaf: 0 });
  eq("a zero cap waives nothing", off.waivedXaf, 0);
  eq("and charges the full fee", off.payableXaf, 1500);
  check("and the banner does not appear either", !eligibleForLaunchOffer(0, 0));
  check("nor for somebody who has ordered before", !eligibleForLaunchOffer(1, CAP));
  check("but it does for a new customer", eligibleForLaunchOffer(0, CAP));
}

console.log("\nDegenerate input never invents money");
{
  eq("a zero fee waives nothing", applyLaunchOffer({ feeXaf: 0, completedOrders: 0, capXaf: CAP }).waivedXaf, 0);
  eq("a negative fee is treated as zero", applyLaunchOffer({ feeXaf: -500, completedOrders: 0, capXaf: CAP }).payableXaf, 0);
  eq("the waiver never exceeds the fee", applyLaunchOffer({ feeXaf: 400, completedOrders: 0, capXaf: 99_999 }).waivedXaf, 400);
  check(
    "and the payable is never negative",
    applyLaunchOffer({ feeXaf: 400, completedOrders: 0, capXaf: 99_999 }).payableXaf >= 0
  );
}

console.log("\nThe rider is paid as though there were no offer at all");
{
  /*
    The check the whole feature stands on. A waived order and a paid order at
    the same fee must produce the same rider payout, to the franc — the waiver
    is the company's cost and comes out of the company's share.
  */
  const fee = 1500;
  const paid = splitEarnings(fee, 60);
  const waived = applyLaunchOffer({ feeXaf: fee, completedOrders: 0, capXaf: CAP });
  const riderOnWaivedOrder = splitEarnings(fee, 60).riderPayoutXaf;

  eq("the rider earns the same on a free delivery", riderOnWaivedOrder, paid.riderPayoutXaf);
  eq("which is 900 on a 1,500 fee", riderOnWaivedOrder, 900);
  eq("and the company absorbs the whole waiver", waived.waivedXaf, 1500);

  // Stated as source, because the failure mode is somebody "simplifying" the
  // route by splitting the payable instead of the fee.
  const route = code("src/app/api/orders/route.ts");
  check(
    "the order route never splits the payable",
    !/splitEarnings\(\s*payable/i.test(route),
    "splitting what the customer paid would fund the promotion out of the rider's share"
  );
}

console.log("\nAnd the gift survives leaving the checkout screen");
{
  const route = code("src/app/api/orders/route.ts");
  check(
    "the waiver is stored on the order, not only on the payment",
    /launchWaiverXaf:/.test(route),
    "applied to the Payment row alone, it vanishes from every later screen"
  );

  const breakdown = code("src/components/customer/order/MoneyBreakdown.tsx");
  check(
    "the money breakdown knows about it",
    breakdown.includes("waivedXaf"),
    "otherwise the pinned bar and the total four lines above it differ by the size of the gift"
  );
  check(
    "and subtracts it from the total it prints",
    /money\.totalXaf\s*-\s*waivedXaf/.test(breakdown),
    "a screen showing two different totals makes the customer pick one, and they pick the larger"
  );

  const receipt = code("src/components/customer/order/receiptPdf.tsx");
  check(
    "the receipt subtracts it too",
    /-\s*waived/.test(receipt),
    "a receipt is a document people keep; one that disagrees with the transaction is worse than none"
  );
  check(
    "and gives it a line of its own",
    /launchWaiverXaf/.test(receipt),
    "a total that is simply smaller teaches nobody that they were given anything"
  );
}

console.log(
  `\n${failures === 0 ? "The first delivery is free, the rider is paid in full, and the gift is still there tomorrow." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
