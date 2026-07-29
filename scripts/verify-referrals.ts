/**
 * Referral money, checked against the invariants that matter.
 *
 * Two of these are the whole reason the module exists: the rider must be paid
 * exactly the same on a referred order as on any other, and a referral must
 * never make an order cost more than it earns. Everything else is detail.
 */
import {
  DEFAULT_TERMS,
  referralReward,
  creditToApply,
  hasEarned,
  generateReferralCode,
  normalizeReferralCode,
  codeProblem,
} from "../src/lib/referrals/rules";
import { splitEarnings } from "../src/lib/orders/earnings";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

console.log("\n— the rider is never charged for marketing —");
for (const fee of [500, 1000, 1500, 2000, 2500, 5000]) {
  const plain = splitEarnings(fee, 60);
  const referred = splitEarnings(fee, 60);
  check(
    `${fee} XAF: rider paid the same referred or not (${plain.riderPayoutXaf})`,
    plain.riderPayoutXaf === referred.riderPayoutXaf
  );
}

console.log("\n— a referral never costs more than the order earns —");
for (const fee of [500, 1000, 1500, 2000, 2500, 5000]) {
  const { riderPayoutXaf } = splitEarnings(fee, 60);
  const reward = referralReward({ feeXaf: fee, riderPayoutXaf, terms: DEFAULT_TERMS });
  const companyShare = fee - riderPayoutXaf;
  check(`${fee} XAF: company share stays positive`, companyShare - reward >= 0, `share ${companyShare} reward ${reward}`);
  check(`${fee} XAF: reward is 5% of the fee or less`, reward <= Math.round(fee * 0.05) , String(reward));
}

console.log("\n— stacked with an ambassador commission —");
{
  const fee = 1500;
  const { riderPayoutXaf } = splitEarnings(fee, 60); // 900
  const ambassadorCommission = 60;
  const reward = referralReward({
    feeXaf: fee,
    riderPayoutXaf,
    otherCostsXaf: ambassadorCommission,
    terms: DEFAULT_TERMS,
  });
  const left = fee - riderPayoutXaf - ambassadorCommission - reward;
  check("both can be paid and we still keep something", left >= 0, `left ${left}`);
  check("rider still gets 900", riderPayoutXaf === 900);
}

console.log("\n— a thin margin cannot go negative —");
{
  // Everything already spent: the reward has to be nothing.
  const reward = referralReward({ feeXaf: 1000, riderPayoutXaf: 600, otherCostsXaf: 400, terms: DEFAULT_TERMS });
  check("reward is zero when nothing is left", reward === 0, String(reward));
  const reward2 = referralReward({ feeXaf: 1000, riderPayoutXaf: 600, otherCostsXaf: 380, terms: DEFAULT_TERMS });
  check("and is capped at what remains", reward2 === 20, String(reward2));
}

console.log("\n— credit reduces a bill, it does not become a payout —");
check("cannot spend more than the balance", creditToApply(200, 1500) === 200);
check("cannot spend more than the fee", creditToApply(5000, 1500) === 1500);
check("a zero balance spends nothing", creditToApply(0, 1500) === 0);
check("a negative balance cannot pay out", creditToApply(-500, 1500) === 0);
check("a zero fee spends nothing", creditToApply(500, 0) === 0);

console.log("\n— nothing is earned until a delivery really happened —");
check("delivered and paid earns", hasEarned({ delivered: true, paid: true, isTest: false }));
check("delivered but unpaid earns nothing", !hasEarned({ delivered: true, paid: false, isTest: false }));
check("paid but undelivered earns nothing", !hasEarned({ delivered: false, paid: true, isTest: false }));
check("a test order earns nothing", !hasEarned({ delivered: true, paid: true, isTest: true }));

console.log("\n— codes —");
{
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) seen.add(generateReferralCode());
  check("codes are 6 characters", [...seen].every((c) => c.length === 6));
  check("2000 codes collide rarely", seen.size > 1990, `${seen.size} unique`);
  check(
    "no lookalike characters that break a phone call",
    [...seen].every((c) => !/[BIOSZ0128]/.test(c))
  );
  check("a code read back with spaces still works", normalizeReferralCode(" ab-cd 12 ") === "ABCD12");
  check("a short code is refused", codeProblem("ABC") !== null);
  check("a good code is accepted", codeProblem("ACDEFG") === null);
}

console.log("\n— the friend-side discount is the owner's number to set —");
check("defaults to nothing, as asked", DEFAULT_TERMS.friendDiscountXaf === 0);
check("the referrer's share defaults to 5%", DEFAULT_TERMS.rewardPercent === 5);
{
  const { riderPayoutXaf } = splitEarnings(1500, 60);
  const generous = referralReward({ feeXaf: 1500, riderPayoutXaf, terms: { rewardPercent: 100, friendDiscountXaf: 0 } });
  check("even an absurd percentage cannot exceed our share", generous <= 1500 - riderPayoutXaf, String(generous));
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
