/**
 * Proves the rider float — company cash in a rider's hands.
 *
 * Run: npx tsx scripts/verify-rider-float.ts
 */
import {
  canTopUpRider,
  canCoverPurchase,
  riderFloatAvailable,
  riderFloatBalance,
  riderReturnEntry,
  spendableXaf,
  type RiderFloatEntry,
} from "../src/lib/riders/float";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const topup = (n: number): RiderFloatEntry => ({ amountXaf: n, type: "TOPUP" });
const ret = (n: number): RiderFloatEntry => ({ amountXaf: -n, type: "RETURN" });

const OPEN = { limitXaf: 20000, suspended: false };
const NONE = { limitXaf: 0, suspended: false };
const PAUSED = { limitXaf: 20000, suspended: true };

console.log("\nWhat the rider is holding");
check("top-ups sum", riderFloatBalance([topup(10000), topup(5000)]), 15000);
check("returns reduce it", riderFloatBalance([topup(10000), ret(4000)]), 6000);
check("headroom is limit minus held", riderFloatAvailable(OPEN, [topup(5000)]), 15000);
check("no limit means no headroom", riderFloatAvailable(NONE, []), 0);
check("headroom never negative", riderFloatAvailable({ limitXaf: 5000, suspended: false }, [topup(9000)]), 0);

console.log("\nTopping up — the refusals matter most");
check("a rider with no float is refused", canTopUpRider(NONE, [], 5000).refusal, "NO_FLOAT");
check("a suspended float refuses top-ups", canTopUpRider(PAUSED, [], 5000).refusal, "SUSPENDED");
check("within the limit is allowed", canTopUpRider(OPEN, [topup(5000)], 5000).ok, true);
check("exactly the limit is allowed", canTopUpRider(OPEN, [topup(15000)], 5000).ok, true);
check("one franc over is refused", canTopUpRider(OPEN, [topup(15000)], 5001).refusal, "OVER_LIMIT");
check("zero is not a top-up", canTopUpRider(OPEN, [], 0).refusal, "INVALID_AMOUNT");
check("negative is refused", canTopUpRider(OPEN, [], -5000).refusal, "INVALID_AMOUNT");
check("NaN is refused", canTopUpRider(OPEN, [], Number.NaN).refusal, "INVALID_AMOUNT");

console.log("\nHanding cash back");
check("a return is recorded negative", riderReturnEntry([topup(8000)], 8000), { amountXaf: -8000, type: "RETURN" });
check("returning more than held is clamped", riderReturnEntry([topup(8000)], 99999), { amountXaf: -8000, type: "RETURN" });
check("nothing held means nothing to return", riderReturnEntry([topup(8000), ret(8000)], 1000), null);
check("a suspended rider can still return cash", riderReturnEntry([topup(5000)], 5000) !== null, true);

console.log("\nCan they cover tonight's shopping?");
check("enough in hand", canCoverPurchase(OPEN, [topup(10000)], 6000), true);
check("exactly enough", canCoverPurchase(OPEN, [topup(6000)], 6000), true);
check("not enough is caught before dispatch, not at the counter",
  canCoverPurchase(OPEN, [topup(3000)], 6000), false);
check("nothing needed is always coverable", canCoverPurchase(NONE, [], 0), true);

console.log("\nCash they have already laid out tonight");
check("what's spent is off the table",
  canCoverPurchase(OPEN, [topup(20000)], 6000, 15000), false);
check("what's left still covers a smaller job",
  canCoverPurchase(OPEN, [topup(20000)], 5000, 15000), true);
check("spending the lot leaves nothing",
  canCoverPurchase(OPEN, [topup(20000)], 1, 20000), false);
check("spendable is held less advanced", spendableXaf([topup(20000)], 15000), 5000);
check("a negative advance can't inflate what they hold",
  spendableXaf([topup(20000)], -5000), 20000);

console.log(`\n${failures === 0 ? "All rider-float rules hold — no rider carries company cash nobody granted." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
