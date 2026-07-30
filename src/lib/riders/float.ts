/**
 * Rider float — company cash in a rider's hands, so they never shop with theirs.
 *
 * The owner's decision was that the company funds the shopping, not the rider.
 * That is the right call: a rider who has to front 5,000 XAF of their own money
 * to buy someone's dinner is limited to whatever cash they happen to be
 * carrying, and bears a risk that is not theirs to bear.
 *
 * This is the mirror image of the merchant float. There, a business owes us for
 * fees we carried; here, a rider holds cash we advanced. Same discipline, same
 * reasons:
 *
 *  - **No float unless someone granted it.** The limit defaults to 0. Handing a
 *    rider company cash is a decision with a name on it, never something earned
 *    automatically by good numbers.
 *  - **The limit is a hard ceiling** on what they may be holding at once. It
 *    bounds the loss if a phone is stolen or a rider disappears.
 *  - **The ledger is append-only and is the only truth.** The balance is always
 *    summed, never stored, exactly as `AmbassadorLedger` and
 *    `MerchantFloatLedger` work.
 *  - **A suspended float still accepts returns.** Stopping top-ups must never
 *    stop a rider handing money back.
 *
 * The balance answers one question: *how much of our cash is this rider holding
 * right now?* A purchase does not reduce what they owe us — it converts cash
 * into a receivable from the customer, which the delivery then collects. So a
 * PURCHASE leaves the balance alone and is recorded for the trail; only cash
 * physically returned reduces it.
 */

export type RiderFloatEntryType = "TOPUP" | "RETURN" | "ADJUSTMENT";

export interface RiderFloatEntry {
  /** Positive = we handed them cash. Negative = they handed it back. */
  amountXaf: number;
  type: RiderFloatEntryType;
}

export interface RiderFloatAccount {
  /** The most company cash this rider may hold at once. 0 (or null) = none. */
  limitXaf: number | null;
  /** Pauses new top-ups. Returns are always allowed. */
  suspended: boolean;
}

/** How much of our cash the rider is holding. Always summed, never stored. */
export function riderFloatBalance(entries: RiderFloatEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountXaf, 0);
}

/** How much more we are willing to hand them right now. Never negative. */
export function riderFloatAvailable(account: RiderFloatAccount, entries: RiderFloatEntry[]): number {
  const limit = account.limitXaf ?? 0;
  if (limit <= 0) return 0;
  return Math.max(0, limit - riderFloatBalance(entries));
}

export type RiderFloatRefusal = "NO_FLOAT" | "SUSPENDED" | "OVER_LIMIT" | "INVALID_AMOUNT";

export interface RiderFloatDecision {
  ok: boolean;
  refusal: RiderFloatRefusal | null;
  wouldBeXaf: number;
  availableXaf: number;
}

/**
 * Whether we may hand this rider more cash right now.
 *
 * Every caller goes through this rather than comparing numbers itself, so the
 * top-up screen and the accounting cannot disagree about what a rider is
 * carrying.
 */
export function canTopUpRider(
  account: RiderFloatAccount,
  entries: RiderFloatEntry[],
  amountXaf: number
): RiderFloatDecision {
  const balance = riderFloatBalance(entries);
  const available = riderFloatAvailable(account, entries);
  const wouldBe = balance + amountXaf;

  if (!Number.isFinite(amountXaf) || amountXaf <= 0) {
    return { ok: false, refusal: "INVALID_AMOUNT", wouldBeXaf: balance, availableXaf: available };
  }
  if ((account.limitXaf ?? 0) <= 0) {
    return { ok: false, refusal: "NO_FLOAT", wouldBeXaf: wouldBe, availableXaf: 0 };
  }
  if (account.suspended) {
    return { ok: false, refusal: "SUSPENDED", wouldBeXaf: wouldBe, availableXaf: available };
  }
  if (wouldBe > (account.limitXaf ?? 0)) {
    return { ok: false, refusal: "OVER_LIMIT", wouldBeXaf: wouldBe, availableXaf: available };
  }
  return { ok: true, refusal: null, wouldBeXaf: wouldBe, availableXaf: available - amountXaf };
}

/**
 * Cash handed back, clamped to what they are actually holding.
 *
 * Over-returning would push the balance negative and make it look as though the
 * company owes a rider float it never advanced.
 */
export function riderReturnEntry(entries: RiderFloatEntry[], returnedXaf: number): RiderFloatEntry | null {
  const balance = riderFloatBalance(entries);
  if (balance <= 0 || returnedXaf <= 0) return null;
  return { amountXaf: -Math.min(returnedXaf, balance), type: "RETURN" };
}

/**
 * Can this rider afford to buy the customer's shopping from the float?
 *
 * A cap the rider cannot cover is a job they should not be sent on, and finding
 * that out at the counter is the worst possible moment.
 */
export function canCoverPurchase(
  account: RiderFloatAccount,
  entries: RiderFloatEntry[],
  neededXaf: number
): boolean {
  if (neededXaf <= 0) return true;
  return riderFloatBalance(entries) >= neededXaf;
}

export const RIDER_FLOAT_REFUSAL_MESSAGE: Record<RiderFloatRefusal, string> = {
  NO_FLOAT: "This rider has no float. An owner has to grant a limit first.",
  SUSPENDED: "This rider's float is suspended. They can still hand cash back.",
  OVER_LIMIT: "This would put them over the most they're allowed to carry.",
  INVALID_AMOUNT: "A top-up has to be a positive amount.",
};
