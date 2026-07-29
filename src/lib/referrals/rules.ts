/**
 * Customer referrals — one person telling a friend.
 *
 * Deliberately not the ambassador programme. A referral has no relationship
 * behind it: no brief, no content expectations, no term, nobody selected
 * anybody. Somebody liked the service enough to pass on a code, and gets
 * something back when that turns into a real delivery. The two were built as
 * one thing and that made both of them wrong — an ambassador was just a
 * referrer with a bigger cut, and a referrer had to apply for approval.
 *
 * The rules that hold:
 *
 * - **The rider is never charged for it.** The reward comes out of the
 *   company's share, exactly as the ambassador commission does. A referred
 *   order must pay the rider the same as any other.
 * - **Nothing is earned until a delivery actually happened and was paid for.**
 *   Not on a quote, not on a cancellation, never in test mode.
 * - **A code binds once.** The customer who referred you is the one who
 *   referred you, permanently — re-entering somebody else's code later does
 *   nothing.
 * - **Credit is spent before it is earned again**, so a balance cannot be
 *   counted twice.
 */

export interface ReferralTerms {
  /** Share of the delivery fee the referrer earns as credit. */
  rewardPercent: number;
  /** What the friend gets off their first order. May be zero. */
  friendDiscountXaf: number;
}

export const DEFAULT_TERMS: ReferralTerms = {
  rewardPercent: 5,
  friendDiscountXaf: 0,
};

/** Codes people have to read aloud down a phone line, so no lookalike characters. */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479";
const CODE_LENGTH = 6;

/**
 * A code for a new account.
 *
 * Random rather than derived from a name or number: a code built from somebody's
 * phone number leaks their phone number to everyone they share it with.
 */
export function generateReferralCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

export function normalizeReferralCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

export interface RewardInput {
  feeXaf: number;
  riderPayoutXaf: number;
  /** Anything already taken out of our share on this order — an ambassador commission. */
  otherCostsXaf?: number;
  terms: ReferralTerms;
}

/**
 * What the referrer earns on one delivery.
 *
 * Capped at whatever is left of the company's share after everything else, so
 * a referral can never make an order cost us more than it earns. The rider's
 * number is an input here and never an output — it is not ours to spend.
 */
export function referralReward(input: RewardInput): number {
  const { feeXaf, riderPayoutXaf, terms } = input;
  const otherCosts = input.otherCostsXaf ?? 0;
  const companyShare = Math.max(0, feeXaf - riderPayoutXaf - otherCosts);
  const raw = Math.round((feeXaf * terms.rewardPercent) / 100);
  return Math.max(0, Math.min(raw, companyShare));
}

/**
 * How much credit a customer may spend on one order.
 *
 * Never more than they have, and never more than the fee — credit reduces a
 * bill, it does not become a payout.
 */
export function creditToApply(balanceXaf: number, feeXaf: number): number {
  return Math.max(0, Math.min(Math.max(0, balanceXaf), Math.max(0, feeXaf)));
}

export interface EarnConditions {
  delivered: boolean;
  paid: boolean;
  isTest: boolean;
}

/** Whether this order has actually earned its referrer anything. */
export function hasEarned(c: EarnConditions): boolean {
  return c.delivered && c.paid && !c.isTest;
}

/** Why a code cannot be used, or null when it can. */
export function codeProblem(code: string): string | null {
  if (code.length < 4) return "That code is too short.";
  if (code.length > 12) return "That code is too long.";
  if (!/^[A-Z0-9]+$/.test(code)) return "Codes are letters and numbers only.";
  return null;
}
