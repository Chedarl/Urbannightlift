import { splitEarnings } from "@/lib/orders/earnings";

/**
 * What an ambassador costs and what a referred customer saves.
 *
 * The original proposal was 1% of the delivery fee to the ambassador and 1% off
 * for the customer. On a typical 1,500 XAF fee that is 15 XAF each: an
 * ambassador would need a hundred referred orders to earn a single delivery
 * fee, and a 15 XAF discount is beneath noticing. The scheme would have cost 2%
 * of margin and changed nobody's behaviour. The instinct — treat referral
 * payouts as the marketing budget rather than a discount — was right; the
 * percentage was simply applied to too small a base.
 *
 * So the numbers moved to where they do something: a flat, visible discount on
 * the customer's first order, and a share of the company's margin to the
 * ambassador on everything that customer orders for a while afterwards.
 *
 * Two rules here are not negotiable, and they are the reason this lives in one
 * module rather than being inlined at each call site:
 *
 *  1. **The rider is never charged for marketing.** Both the discount and the
 *     commission come out of the company's share. The rider is always paid on
 *     the full, undiscounted fee — otherwise they quietly earn less on referred
 *     orders and come to resent them, which is a slow way to lose riders.
 *  2. **A delivery can never be sold at a loss.** The discount is capped at the
 *     company's share *after* the ambassador is paid. Capping against the gross
 *     was not enough — on a cheap zone the discount took the whole margin and
 *     the commission then pushed the delivery under.
 */

export interface AmbassadorTerms {
  /** Flat amount off the referred customer's first order. */
  discountXaf: number;
  /** Percentage of the company's gross share paid to the ambassador. */
  commissionPercent: number;
  /** How many of that customer's orders keep earning. */
  orderCap: number;
}

export const DEFAULT_TERMS: AmbassadorTerms = {
  discountXaf: 500,
  commissionPercent: 10,
  orderCap: 10,
};

export interface OrderEconomics {
  feeXaf: number;
  riderSharePercent: number;
  /** Rider's pay — calculated on the full fee, never on the discounted amount. */
  riderPayoutXaf: number;
  /** Company's share before any referral cost. */
  companyGrossXaf: number;
  /** What comes off the customer's bill. */
  discountXaf: number;
  /** What the ambassador earns on this order. */
  commissionXaf: number;
  /** What the company actually keeps. */
  companyNetXaf: number;
  /** What the customer pays. */
  customerPaysXaf: number;
}

/**
 * The full picture for one order, referred or not.
 *
 * `orderIndex` is which order this is for that customer, counting from 1 — the
 * discount applies only to the first, and the commission stops after the cap.
 */
export function orderEconomics({
  feeXaf,
  riderSharePercent,
  referred,
  orderIndex,
  terms = DEFAULT_TERMS,
}: {
  feeXaf: number;
  riderSharePercent: number;
  referred: boolean;
  orderIndex: number;
  terms?: AmbassadorTerms;
}): OrderEconomics {
  const split = splitEarnings(feeXaf, riderSharePercent);
  const companyGrossXaf = split.companyEarningXaf;

  const withinCap = referred && orderIndex >= 1 && orderIndex <= terms.orderCap;

  // Deliberately calculated on the GROSS company share, not on what is left
  // after the discount. Otherwise the ambassador's very first commission — the
  // one that proves to them the scheme is real — collapses to a few francs.
  const commissionXaf = withinCap
    ? Math.round((companyGrossXaf * terms.commissionPercent) / 100)
    : 0;

  // First order only, and capped at whatever margin is left AFTER the
  // ambassador is paid. Capping against the gross was not enough: on a cheap
  // zone the discount would take the whole margin and the commission would then
  // push the delivery into a loss.
  const discountXaf =
    referred && orderIndex === 1
      ? Math.max(0, Math.min(terms.discountXaf, companyGrossXaf - commissionXaf))
      : 0;

  return {
    feeXaf: split.feeXaf,
    riderSharePercent: split.riderSharePercent,
    riderPayoutXaf: split.riderPayoutXaf,
    companyGrossXaf,
    discountXaf,
    commissionXaf,
    companyNetXaf: companyGrossXaf - discountXaf - commissionXaf,
    customerPaysXaf: split.feeXaf - discountXaf,
  };
}

/** Codes are typed by hand off a poster or a WhatsApp message. */
export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

const RESERVED = new Set([
  "ADMIN", "URBAN", "UNL", "NIGHT", "LIFT", "TEST", "ORDER", "RIDER", "SUPPORT", "HELP", "NULL",
]);

/**
 * Ambassadors choose their own code, so it has to be short enough to say out
 * loud and long enough not to be guessed into by accident.
 */
export function codeProblem(raw: string): string | null {
  const code = normalizeCode(raw);
  if (code.length < 4) return "Pick a code with at least 4 letters or numbers.";
  if (code.length > 16) return "Keep the code to 16 characters or fewer.";
  if (RESERVED.has(code)) return "That code is reserved. Pick another.";
  if (/^\d+$/.test(code)) return "Use at least one letter so it isn't mistaken for a phone number.";
  return null;
}

/**
 * Whether an order should actually pay a commission.
 *
 * Money only moves for work that finished: delivered, paid for, and real. A
 * quote is not a sale, a cancelled order is not a sale, and a rehearsal is
 * certainly not a sale — paying out on any of those would make the ambassador
 * ledger a fiction the moment the owner started testing.
 */
export function commissionEarned(order: {
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  isTest: boolean;
}): boolean {
  if (order.isTest) return false;
  if (!["DELIVERED", "CLOSED"].includes(order.orderStatus)) return false;
  // Cash is collected at the door, so a delivered cash order is a paid order.
  if (order.paymentMethod === "CASH") return true;
  return order.paymentStatus === "VERIFIED";
}
