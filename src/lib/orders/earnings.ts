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
 * What the rider owes the company, or is owed by it, on a single delivery.
 *
 * On cash on delivery the rider collects the whole fee at the door, so they
 * are holding the company's 40% — a positive number here means the rider owes
 * us that much at settlement. On a MoMo or Orange payment the money reached us
 * directly, so we owe the rider their 60%.
 */
export function riderBalanceForOrder(args: {
  paymentMethod: string;
  riderPayoutXaf: number | null;
  companyEarningXaf: number | null;
  cashCollectedXaf: number | null;
}): number {
  const { paymentMethod, riderPayoutXaf, companyEarningXaf, cashCollectedXaf } = args;
  if (riderPayoutXaf == null || companyEarningXaf == null) return 0;
  if (paymentMethod === "CASH") {
    // They hold what they actually collected; anything short of the full fee is
    // already visible as a shortfall rather than being netted away silently.
    const collected = cashCollectedXaf ?? riderPayoutXaf + companyEarningXaf;
    return collected - riderPayoutXaf;
  }
  return -riderPayoutXaf;
}
