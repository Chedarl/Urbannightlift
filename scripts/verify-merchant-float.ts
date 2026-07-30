/**
 * Proves the merchant float rules.
 *
 * This is the only module in the codebase that decides whether to lend a
 * business money, so the cases that matter most are the refusals.
 *
 * Run: npx tsx scripts/verify-merchant-float.ts
 */
import {
  canChargeToFloat,
  floatAvailable,
  floatBalance,
  settlementEntry,
  type FloatEntry,
} from "../src/lib/merchants/float";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const charge = (n: number): FloatEntry => ({ amountXaf: n, type: "CHARGE" });
const settle = (n: number): FloatEntry => ({ amountXaf: -n, type: "SETTLEMENT" });

const OPEN = { limitXaf: 5000, suspended: false };
const NONE = { limitXaf: 0, suspended: false };
const NULLED = { limitXaf: null, suspended: false };
const PAUSED = { limitXaf: 5000, suspended: true };

console.log("\nBalance and headroom");
check("balance sums charges", floatBalance([charge(1500), charge(1200)]), 2700);
check("settlements reduce the balance", floatBalance([charge(1500), charge(1200), settle(2000)]), 700);
check("a fully settled float is zero", floatBalance([charge(1500), settle(1500)]), 0);
check("headroom is limit minus balance", floatAvailable(OPEN, [charge(1500)]), 3500);
check("no limit means no headroom", floatAvailable(NONE, []), 0);
check("a null limit means no headroom", floatAvailable(NULLED, []), 0);
check("headroom never goes negative", floatAvailable({ limitXaf: 1000, suspended: false }, [charge(4000)]), 0);

console.log("\nCharging — the refusals are the point");
check("a merchant with no float is refused",
  canChargeToFloat(NONE, [], 1500).refusal, "NO_FLOAT");
check("a null limit is refused",
  canChargeToFloat(NULLED, [], 1500).refusal, "NO_FLOAT");
check("a suspended float refuses new charges",
  canChargeToFloat(PAUSED, [], 1500).refusal, "SUSPENDED");
check("a charge within the limit is allowed",
  canChargeToFloat(OPEN, [charge(1500)], 1500).ok, true);
check("a charge that exactly hits the limit is allowed",
  canChargeToFloat(OPEN, [charge(3500)], 1500).ok, true);
check("one franc past the limit is refused",
  canChargeToFloat(OPEN, [charge(3500)], 1501).refusal, "OVER_LIMIT");
check("zero is not a charge",
  canChargeToFloat(OPEN, [], 0).refusal, "INVALID_AMOUNT");
check("a negative charge is refused",
  canChargeToFloat(OPEN, [], -1500).refusal, "INVALID_AMOUNT");
check("NaN is refused",
  canChargeToFloat(OPEN, [], Number.NaN).refusal, "INVALID_AMOUNT");
check("an allowed charge reports the headroom left after it",
  canChargeToFloat(OPEN, [charge(1000)], 1500).availableXaf, 2500);
check("settling frees the headroom back up",
  canChargeToFloat(OPEN, [charge(5000), settle(5000)], 5000).ok, true);

console.log("\nSettlement");
check("a settlement is recorded as negative",
  settlementEntry([charge(2000)], 2000), { amountXaf: -2000, type: "SETTLEMENT" });
check("an over-payment is clamped to what is owed, never becoming credit",
  settlementEntry([charge(2000)], 9999), { amountXaf: -2000, type: "SETTLEMENT" });
check("nothing owed means nothing to settle",
  settlementEntry([charge(2000), settle(2000)], 500), null);
check("a zero payment records nothing",
  settlementEntry([charge(2000)], 0), null);
check("a suspended merchant can still settle",
  settlementEntry([charge(2000)], 2000) !== null, true);

console.log(`\n${failures === 0 ? "All float rules hold — no path lends without a granted limit." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
