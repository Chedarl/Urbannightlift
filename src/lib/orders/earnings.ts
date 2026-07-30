/**
 * The commission split.
 *
 * Urban Night Lift's model is a revenue share on the delivery fee: the rider
 * takes the majority (60% by default) and the company keeps the rest. Two
 * accounting rules matter more than the arithmetic:
 *
 *  1. **The rate is frozen at delivery.** When the owner changes the split,
 *     completed deliveries must keep the terms they were completed under —
 *     otherwise last month's accounts silently change and no rider will ever
 *     trust the numbers again.
 *  2. **The rounding always favours the rider.** A one-franc rounding error
 *     repeated a thousand times is a real amount of money, and a rider who
 *     finds it is a rider who thinks they're being shorted. The company takes
 *     the remainder.
 */

export interface EarningsSplit {
  /** The fee the split was calculated on. */
  feeXaf: number;
  riderSharePercent: number;
  riderPayoutXaf: number;
  companyEarningXaf: number;
}

export const DEFAULT_RIDER_SHARE_PERCENT = 60;

export function splitEarnings(feeXaf: number, riderSharePercent: number): EarningsSplit {
  const pct = Math.min(100, Math.max(0, Math.round(riderSharePercent)));
  const fee = Math.max(0, Math.round(feeXaf));
  // Round the rider's side up; the company absorbs the remainder.
  const riderPayoutXaf = Math.ceil((fee * pct) / 100);
  return {
    feeXaf: fee,
    riderSharePercent: pct,
    riderPayoutXaf,
    companyEarningXaf: fee - riderPayoutXaf,
  };
}

/**
 * What a rider owes or is owed on a delivery lives in
 * `riderSettlementFromOrder` (`src/lib/orders/goodsMoney.ts`), not here.
 *
 * This module used to carry a `riderBalanceForOrder` that knew only about the
 * fee. On a shopping order that is wrong in the rider's disfavour: someone who
 * advanced 5,000 XAF for a customer's food and collected 6,500 at the door was
 * recorded as having collected 1,500 and *owing us* 600, with the 5,000 they
 * laid out appearing nowhere. It has been removed rather than deprecated —
 * leaving two functions that answer the same money question differently is how
 * the wrong one gets called again.
 */
