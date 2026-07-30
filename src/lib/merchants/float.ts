/**
 * Merchant float — letting a business settle weekly instead of per order.
 *
 * For a small merchant with no working capital, paying a delivery fee on every
 * single order is the thing that stops them using us at night. A float is the
 * stickiest thing we can offer them: we carry the fee, they settle it later.
 * Nobody else in this market does it.
 *
 * It is also us lending money, so the rules below are deliberately
 * conservative and all in one place:
 *
 *  - **No float unless a human granted one.** The limit defaults to 0 and 0
 *    means off. There is no code path that raises a limit automatically, no
 *    matter how well a merchant is doing — that decision stays a person's,
 *    recorded with their name.
 *  - **The limit is a hard ceiling.** A charge that would take the balance past
 *    it is refused, not "allowed just this once". Partial charges are refused
 *    too: an order either goes on the float or it does not.
 *  - **The ledger is append-only and is the only truth.** The balance is always
 *    summed from entries, never stored, so it can be reconstructed and audited
 *    the same way `AmbassadorLedger` already works for money owed outward.
 *  - **A suspended float can still be settled.** Suspension stops new charges;
 *    it must never block a merchant from paying down what they owe.
 */

/** What a float entry is. Positive amounts increase what the merchant owes. */
export type FloatEntryType = "CHARGE" | "SETTLEMENT" | "ADJUSTMENT";

export interface FloatEntry {
  /** Positive = we carried a fee for them. Negative = they paid it down. */
  amountXaf: number;
  type: FloatEntryType;
}

export interface FloatAccount {
  /** Granted ceiling. 0 (or null) means this merchant has no float. */
  limitXaf: number | null;
  /** Set when the owner has paused new charges without closing the account. */
  suspended: boolean;
}

/** What the merchant currently owes us. Always summed, never stored. */
export function floatBalance(entries: FloatEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountXaf, 0);
}

/** Headroom left before the granted ceiling. Never negative. */
export function floatAvailable(account: FloatAccount, entries: FloatEntry[]): number {
  const limit = account.limitXaf ?? 0;
  if (limit <= 0) return 0;
  return Math.max(0, limit - floatBalance(entries));
}

export type FloatRefusal =
  | "NO_FLOAT"
  | "SUSPENDED"
  | "OVER_LIMIT"
  | "INVALID_AMOUNT";

export interface FloatDecision {
  ok: boolean;
  refusal: FloatRefusal | null;
  /** Balance the charge would produce. Present even on refusal, for the message. */
  wouldBeXaf: number;
  availableXaf: number;
}

/**
 * Whether this amount may go on the merchant's float right now.
 *
 * Every caller must go through this rather than comparing numbers itself, so
 * the checkout, the admin screen and the accounting cannot disagree about
 * whether a merchant was good for it.
 */
export function canChargeToFloat(
  account: FloatAccount,
  entries: FloatEntry[],
  amountXaf: number
): FloatDecision {
  const balance = floatBalance(entries);
  const available = floatAvailable(account, entries);
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
  // A hard ceiling. No "just this once" — that is how a float becomes a bad debt.
  if (wouldBe > (account.limitXaf ?? 0)) {
    return { ok: false, refusal: "OVER_LIMIT", wouldBeXaf: wouldBe, availableXaf: available };
  }
  return { ok: true, refusal: null, wouldBeXaf: wouldBe, availableXaf: available - amountXaf };
}

/**
 * A settlement entry for money the merchant has paid down.
 *
 * Clamped to what they actually owe, so an over-payment can never push the
 * balance negative and quietly turn into credit we did not agree to give.
 */
export function settlementEntry(entries: FloatEntry[], paidXaf: number): FloatEntry | null {
  const balance = floatBalance(entries);
  if (balance <= 0 || paidXaf <= 0) return null;
  const applied = Math.min(paidXaf, balance);
  return { amountXaf: -applied, type: "SETTLEMENT" };
}

export const REFUSAL_MESSAGE: Record<FloatRefusal, string> = {
  NO_FLOAT: "This merchant has no float. An owner has to grant a limit first.",
  SUSPENDED: "This merchant's float is suspended. They can still settle what they owe.",
  OVER_LIMIT: "This would take them past their float limit.",
  INVALID_AMOUNT: "A float charge has to be a positive amount.",
};
