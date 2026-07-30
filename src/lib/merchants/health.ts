/**
 * How a merchant relationship is doing, from what we actually know.
 *
 * The SMB half of the business is a relationship, not a row in a catalogue —
 * these are the shops we help sell more. A relationship desk needs to see, at a
 * glance, who is thriving, who has gone quiet, and who we have not spoken to in
 * too long. We do not invent metrics we cannot measure (a merchant never
 * accepts or rejects an order in this system, so there is no "acceptance rate");
 * we use what is real: how much they sell through us, whether customers come
 * back to them, and how fresh our contact is.
 *
 * Pure and deterministic, so the read is the same everywhere and testable.
 */

/** No order through us in this long and the relationship is going cold. */
export const QUIET_DAYS = 21;
export const DORMANT_DAYS = 60;
/** Contact older than this should be refreshed with a call. */
export const STALE_CONTACT_DAYS = 60;

export type MerchantStanding = "NEW" | "GROWING" | "STEADY" | "QUIET" | "DORMANT";

export interface MerchantFacts {
  verified: boolean;
  acceptingOrders: boolean;
  orderCount: number;
  /** Distinct customers who ordered from them, and those who came back. */
  uniqueCustomers: number;
  repeatCustomers: number;
  lastOrderAt: Date | null;
  lastConfirmedAt: Date | null;
  createdAt: Date;
}

export interface MerchantRead {
  standing: MerchantStanding;
  /** One line the desk can act on. */
  summary: string;
  daysSinceLastOrder: number | null;
  daysSinceContact: number | null;
  /** Share of their customers who came back, whole percent. */
  reorderPercent: number;
  /** Contact is old enough to be worth refreshing. */
  contactStale: boolean;
}

function days(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

export function readMerchant(f: MerchantFacts, now: Date = new Date()): MerchantRead {
  const daysSinceLastOrder = f.lastOrderAt ? days(f.lastOrderAt, now) : null;
  const daysSinceContact = f.lastConfirmedAt ? days(f.lastConfirmedAt, now) : null;
  const reorderPercent = f.uniqueCustomers > 0 ? Math.round((f.repeatCustomers / f.uniqueCustomers) * 100) : 0;
  const contactStale = daysSinceContact == null || daysSinceContact >= STALE_CONTACT_DAYS;

  let standing: MerchantStanding;
  if (f.orderCount === 0) standing = "NEW";
  else if (daysSinceLastOrder != null && daysSinceLastOrder >= DORMANT_DAYS) standing = "DORMANT";
  else if (daysSinceLastOrder != null && daysSinceLastOrder >= QUIET_DAYS) standing = "QUIET";
  else if (reorderPercent >= 30 || f.orderCount >= 10) standing = "GROWING";
  else standing = "STEADY";

  return {
    standing,
    summary: summarise(f, standing, daysSinceLastOrder),
    daysSinceLastOrder,
    daysSinceContact,
    reorderPercent,
    contactStale,
  };
}

function summarise(f: MerchantFacts, standing: MerchantStanding, sinceOrder: number | null): string {
  if (!f.verified) return "Signed up, not yet verified — call to confirm and switch on.";
  if (standing === "NEW") return "Verified but no orders yet. Worth a call to get them started.";
  const orders = `${f.orderCount} order${f.orderCount === 1 ? "" : "s"} through us`;
  const last =
    sinceOrder == null ? "" : sinceOrder === 0 ? ", one tonight" : `, last ${sinceOrder} day${sinceOrder === 1 ? "" : "s"} ago`;
  if (standing === "DORMANT") return `${orders}${last}. Gone quiet — a call could bring them back.`;
  if (standing === "QUIET") return `${orders}${last}. Slowing down — check in.`;
  if (standing === "GROWING") return `${orders}${last}. Selling well through us — keep them close.`;
  return `${orders}${last}.`;
}

export const STANDING_LABEL: Record<MerchantStanding, string> = {
  NEW: "New",
  GROWING: "Growing",
  STEADY: "Steady",
  QUIET: "Quiet",
  DORMANT: "Dormant",
};

/** Worst-for-the-relationship first: unverified and dormant lead, growing sinks. */
const RANK: Record<MerchantStanding, number> = { NEW: 1, DORMANT: 0, QUIET: 2, STEADY: 3, GROWING: 4 };

export function byStanding<T extends { standing: MerchantStanding; verified: boolean; orderCount: number }>(a: T, b: T): number {
  // An unverified signup is the best lead in the list — deal with it first.
  if (a.verified !== b.verified) return a.verified ? 1 : -1;
  const r = RANK[a.standing] - RANK[b.standing];
  if (r !== 0) return r;
  return b.orderCount - a.orderCount;
}
