/**
 * What kind of customer this is, from what they have actually done.
 *
 * A support desk that has to read twelve rows of order history before it knows
 * whether it is talking to a first-timer or its best customer will treat them
 * identically, which is the same as treating them badly. This turns the history
 * into one word and one line, computed the same way every time so two staff
 * looking at the same person reach the same conclusion.
 *
 * Every threshold is deliberately blunt. The point is not to be precise about
 * somebody's worth; it is to stop somebody who orders four times a week from
 * being handled like a stranger.
 */

export type CustomerTier = "NEW" | "RETURNING" | "REGULAR" | "VIP";
export type CustomerRisk = "NONE" | "WATCH" | "AT_RISK" | "LAPSED" | "BLOCKED";

/** Orders delivered, not orders placed — a cancelled order is not a relationship. */
export const REGULAR_ORDERS = 4;
export const VIP_ORDERS = 12;
/** Nights without an order before somebody counts as drifting away. */
export const LAPSED_DAYS = 45;
export const AT_RISK_DAYS = 21;

export interface CustomerFacts {
  delivered: number;
  cancelled: number;
  complaints: number;
  openCases: number;
  lifetimeSpendXaf: number;
  lastOrderAt: Date | null;
  blockedAt: Date | null;
  createdAt: Date;
}

export interface CustomerRead {
  tier: CustomerTier;
  risk: CustomerRisk;
  /** One sentence a dispatcher can act on before picking up the phone. */
  summary: string;
  daysSinceLastOrder: number | null;
  averageOrderXaf: number;
  /** Share of their orders that ended badly, as a whole percentage. */
  cancelRatePercent: number;
}

function days(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

export function readCustomer(f: CustomerFacts, now: Date = new Date()): CustomerRead {
  const total = f.delivered + f.cancelled;
  const daysSinceLastOrder = f.lastOrderAt ? days(f.lastOrderAt, now) : null;
  const averageOrderXaf = f.delivered > 0 ? Math.round(f.lifetimeSpendXaf / f.delivered) : 0;
  const cancelRatePercent = total > 0 ? Math.round((f.cancelled / total) * 100) : 0;

  const tier: CustomerTier =
    f.delivered >= VIP_ORDERS
      ? "VIP"
      : f.delivered >= REGULAR_ORDERS
        ? "REGULAR"
        : f.delivered >= 1
          ? "RETURNING"
          : "NEW";

  // Risk is ordered worst-first: being blocked outranks having drifted away,
  // which outranks an open complaint. Only one is ever shown.
  let risk: CustomerRisk = "NONE";
  if (f.blockedAt) risk = "BLOCKED";
  else if (daysSinceLastOrder != null && daysSinceLastOrder >= LAPSED_DAYS && f.delivered > 0) risk = "LAPSED";
  else if (f.openCases > 0 || f.complaints >= 2) risk = "AT_RISK";
  else if (
    (daysSinceLastOrder != null && daysSinceLastOrder >= AT_RISK_DAYS && tier !== "NEW") ||
    (cancelRatePercent >= 40 && total >= 3)
  )
    risk = "WATCH";

  return { tier, risk, summary: summarise(f, tier, risk, daysSinceLastOrder), daysSinceLastOrder, averageOrderXaf, cancelRatePercent };
}

function summarise(f: CustomerFacts, tier: CustomerTier, risk: CustomerRisk, since: number | null): string {
  if (risk === "BLOCKED") return "On the do-not-serve list. Read the reason before doing anything.";
  if (tier === "NEW") return "First order with us — nothing to go on yet, so be generous.";

  const orders = `${f.delivered} deliver${f.delivered === 1 ? "y" : "ies"}`;
  const last = since == null ? "" : since === 0 ? ", last one tonight" : `, last one ${since} day${since === 1 ? "" : "s"} ago`;

  if (risk === "LAPSED") return `${orders}${last}. They have drifted away — worth a reason to come back.`;
  if (risk === "AT_RISK")
    return `${orders}${last}, with ${f.openCases > 0 ? "an unanswered complaint" : "complaints on file"}. Handle this one properly.`;
  if (tier === "VIP") return `One of our best — ${orders}${last}. Whatever they are asking for, find a way.`;
  if (tier === "REGULAR") return `A regular — ${orders}${last}.`;
  return `${orders}${last}.`;
}

export const TIER_LABEL: Record<CustomerTier, string> = {
  NEW: "New",
  RETURNING: "Returning",
  REGULAR: "Regular",
  VIP: "VIP",
};

export const RISK_LABEL: Record<CustomerRisk, string> = {
  NONE: "",
  WATCH: "Worth watching",
  AT_RISK: "At risk",
  LAPSED: "Drifted away",
  BLOCKED: "Do not serve",
};

/**
 * Goodwill is capped, on purpose.
 *
 * Anybody who can open the support screen can hand out money, so the limit is
 * the control: enough to fix a late delivery on the spot without a manager,
 * not enough to matter if somebody's account is taken. Anything larger is a
 * conversation with the owner, which is the correct amount of friction.
 */
export const GOODWILL_MAX_XAF = 2000;

export function goodwillProblem(amountXaf: number): string | null {
  if (!Number.isInteger(amountXaf) || amountXaf <= 0) return "Enter an amount in XAF.";
  if (amountXaf > GOODWILL_MAX_XAF) return `The most that can be credited here is ${GOODWILL_MAX_XAF} XAF.`;
  return null;
}
