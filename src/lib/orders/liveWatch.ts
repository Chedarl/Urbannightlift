import type { OrderStatus } from "@prisma/client";

/**
 * What is actually happening out there, right now, and what looks wrong.
 *
 * Dispatch could see a list of orders and a rider's last coordinates buried on
 * an order page, but nothing put the two together and nothing raised a hand.
 * An order sitting unpriced for forty minutes at 11 PM looked exactly like one
 * that arrived thirty seconds ago; a rider whose phone stopped reporting an
 * hour into a run looked exactly like one riding down the road.
 *
 * This turns each live order into one line with a concern attached, so the
 * screen sorts itself: the worst thing first, and nothing needing attention
 * hidden behind something that does not.
 *
 * Every threshold here is deliberately generous. A false alarm at 1 AM costs a
 * phone call; a missed one costs a customer.
 */

/** How stale a rider's last GPS fix has to be before it stops meaning anything. */
export const TRACKING_STALE_MS = 3 * 60_000;
export const TRACKING_LOST_MS = 12 * 60_000;

/** How long a stage may sit before somebody should look at it. */
export const SLOW_REVIEW_MS = 12 * 60_000;
export const SLOW_QUOTE_MS = 20 * 60_000;
export const SLOW_PAYMENT_MS = 25 * 60_000;
export const SLOW_UNASSIGNED_MS = 15 * 60_000;
export const SLOW_RUN_MS = 60 * 60_000;

export type ConcernLevel = "CALM" | "WATCH" | "URGENT";

export interface Concern {
  level: ConcernLevel;
  /** Written for the person about to pick up the phone, not for a log. */
  message: string;
  /** What they should do about it, in three or four words. */
  action: string;
}

export interface LiveOrderInput {
  orderStatus: OrderStatus;
  createdAt: Date;
  quoteSentAt: Date | null;
  quoteAcceptedAt: Date | null;
  paymentStatus: string;
  paymentMethod: string;
  assignedRiderId: string | null;
  riderAcceptedAt: Date | null;
  assignedAt: Date | null;
  riderLocationAt: Date | null;
  riderLat: number | null;
  riderLng: number | null;
  customerConfirmedAt: Date | null;
}

const OUT_WITH_RIDER: OrderStatus[] = [
  "RIDER_ASSIGNED",
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
];

const FINISHED: OrderStatus[] = [
  "DELIVERED",
  "CLOSED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "REJECTED",
  "REFUNDED",
];

/** Orders that are somebody's problem tonight. Everything else is history. */
export function isLive(o: { orderStatus: OrderStatus; customerConfirmedAt: Date | null }): boolean {
  return !FINISHED.includes(o.orderStatus) || (o.orderStatus === "DELIVERED" && o.customerConfirmedAt == null);
}

export function isOutWithRider(status: OrderStatus): boolean {
  return OUT_WITH_RIDER.includes(status);
}

/** How old a rider's last position is, in whole minutes. Null when never sent. */
export function fixAgeMinutes(riderLocationAt: Date | null, now: Date): number | null {
  if (!riderLocationAt) return null;
  return Math.max(0, Math.floor((now.getTime() - riderLocationAt.getTime()) / 60_000));
}

export type TrackingState = "LIVE" | "STALE" | "LOST" | "NEVER";

/**
 * Whether we can still say where a rider is.
 *
 * A web app cannot track a phone with the screen off — that is a platform
 * limit, not a bug, and it is why this distinguishes "stale" from "lost"
 * instead of pretending a five-minute-old fix is a live one.
 */
export function trackingState(riderLocationAt: Date | null, now: Date): TrackingState {
  if (!riderLocationAt) return "NEVER";
  const age = now.getTime() - riderLocationAt.getTime();
  if (age > TRACKING_LOST_MS) return "LOST";
  if (age > TRACKING_STALE_MS) return "STALE";
  return "LIVE";
}

const minutes = (from: Date, now: Date) => Math.floor((now.getTime() - from.getTime()) / 60_000);

/**
 * The one thing most worth saying about this order right now.
 *
 * Returns a single concern rather than a list, because a screen that shows a
 * dispatcher four problems on one row gets read as none.
 */
export function concernOf(o: LiveOrderInput, now: Date): Concern {
  const payOnDelivery = o.paymentMethod === "CASH";

  // Out with a rider: the only thing that matters is whether we still know
  // where they are.
  if (isOutWithRider(o.orderStatus) && o.assignedRiderId) {
    const track = trackingState(o.riderLocationAt, now);
    const ranLong = o.riderAcceptedAt != null && minutes(o.riderAcceptedAt, now) >= SLOW_RUN_MS / 60_000;

    if (track === "LOST") {
      return {
        level: "URGENT",
        message: `No position from the rider for ${fixAgeMinutes(o.riderLocationAt, now)} minutes.`,
        action: "Call the rider",
      };
    }
    if (ranLong) {
      return {
        level: "URGENT",
        message: `Out for ${minutes(o.riderAcceptedAt!, now)} minutes and still not delivered.`,
        action: "Call the rider",
      };
    }
    if (track === "NEVER") {
      return {
        level: "WATCH",
        message: "The rider has never shared their location on this run.",
        action: "Ask them to switch sharing on",
      };
    }
    if (track === "STALE") {
      return {
        level: "WATCH",
        message: `Last position ${fixAgeMinutes(o.riderLocationAt, now)} minutes ago — their screen may have slept.`,
        action: "Check in with the rider",
      };
    }
    return { level: "CALM", message: "Riding, position live.", action: "" };
  }

  // Everything before dispatch: has it been sitting?
  if (!o.quoteSentAt) {
    const waited = minutes(o.createdAt, now);
    return waited >= SLOW_REVIEW_MS / 60_000
      ? { level: "URGENT", message: `Waiting ${waited} minutes for a price.`, action: "Price it now" }
      : { level: "CALM", message: "Waiting to be reviewed and priced.", action: "" };
  }
  if (!o.quoteAcceptedAt) {
    const waited = minutes(o.quoteSentAt, now);
    return waited >= SLOW_QUOTE_MS / 60_000
      ? {
          level: "WATCH",
          message: `The customer has had the price for ${waited} minutes without answering.`,
          action: "Call the customer",
        }
      : { level: "CALM", message: "Waiting on the customer to accept the price.", action: "" };
  }
  if (!payOnDelivery && o.paymentStatus !== "VERIFIED") {
    const waited = minutes(o.quoteAcceptedAt, now);
    if (o.paymentStatus === "SUBMITTED_UNVERIFIED") {
      return {
        level: "URGENT",
        message: "The customer says they have paid. Nobody has checked it.",
        action: "Verify the payment",
      };
    }
    return waited >= SLOW_PAYMENT_MS / 60_000
      ? { level: "WATCH", message: `Accepted ${waited} minutes ago and still unpaid.`, action: "Call the customer" }
      : { level: "CALM", message: "Waiting for payment.", action: "" };
  }
  if (!o.assignedRiderId) {
    const readySince = o.quoteAcceptedAt ?? o.createdAt;
    const waited = minutes(readySince, now);
    return waited >= SLOW_UNASSIGNED_MS / 60_000
      ? { level: "URGENT", message: `Paid and ready for ${waited} minutes with no rider.`, action: "Assign a rider" }
      : { level: "CALM", message: "Ready to dispatch.", action: "" };
  }
  if (!o.riderAcceptedAt && o.assignedAt) {
    const waited = minutes(o.assignedAt, now);
    return waited >= 10
      ? {
          level: "URGENT",
          message: `Assigned ${waited} minutes ago and the rider has not accepted.`,
          action: "Call the rider",
        }
      : { level: "CALM", message: "Waiting for the rider to accept.", action: "" };
  }

  return { level: "CALM", message: "Moving along.", action: "" };
}

const RANK: Record<ConcernLevel, number> = { URGENT: 0, WATCH: 1, CALM: 2 };

/** Worst first, then oldest — so the top of the screen is always the next call. */
export function byConcern<T extends { concern: Concern; createdAt: Date }>(a: T, b: T): number {
  const r = RANK[a.concern.level] - RANK[b.concern.level];
  return r !== 0 ? r : a.createdAt.getTime() - b.createdAt.getTime();
}
