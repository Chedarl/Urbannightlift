import type { OrderStatus } from "@prisma/client";

/**
 * Which orders are still happening.
 *
 * ## Why this is a list and not a `!terminal` check
 *
 * The obvious spelling is "anything that is not DELIVERED or CANCELLED", and it
 * is the wrong one: `OrderStatus` has twenty-three members and four of them
 * (`SAFETY_HOLD`, `REFUND_PENDING`, `CUSTOMER_UNREACHABLE`,
 * `MERCHANT_UNAVAILABLE`) are neither running nor finished. A blocklist would
 * have shown a customer a live tracking strip for an order sitting on a safety
 * hold, pulsing away as though a rider were on the road.
 *
 * So it is an exhaustive table, and `satisfies Record<OrderStatus, boolean>`
 * means **adding a status to the enum fails the build** rather than quietly
 * defaulting it one way or the other. Somebody has to decide.
 */
export const ORDER_IS_LIVE = {
  // Placed, and something is happening — or about to.
  NEW_REQUEST: true,
  AWAITING_DISPATCHER_REVIEW: true,
  APPROVED: true,
  AWAITING_PAYMENT: true,
  PAYMENT_SUBMITTED: true,
  PAYMENT_VERIFIED: true,
  RIDER_ASSIGNED: true,
  RIDER_GOING_TO_PICKUP: true,
  RIDER_ARRIVED_AT_PICKUP: true,
  ITEM_COLLECTED: true,
  RIDER_GOING_TO_DELIVERY: true,
  RIDER_ARRIVED_AT_DELIVERY: true,
  DELIVERY_PROOF_SUBMITTED: true,

  /*
    Delivered is still live, deliberately.

    The last step is not finished until the customer confirms it — there is an
    OTP and a "yes, I got it" — so a strip that vanishes the moment a rider
    marks something delivered takes away the screen the customer needs next.
    The caller drops it once `customerConfirmedAt` is set.
  */
  DELIVERED: true,

  // Finished, one way or another.
  CLOSED: false,
  REJECTED: false,
  CANCELLED_BY_CUSTOMER: false,
  CANCELLED_BY_UNL: false,
  FAILED_DELIVERY: false,
  REFUNDED: false,

  /*
    Stopped, and not the strip's job to say so.

    These are real states a person has to resolve, and a pulsing "on the way"
    banner over one would be a lie told confidently. The order page says what
    has happened; the strip stays out of it.
  */
  SAFETY_HOLD: false,
  CUSTOMER_UNREACHABLE: false,
  MERCHANT_UNAVAILABLE: false,
  REFUND_PENDING: false,
} satisfies Record<OrderStatus, boolean>;

export function isLiveOrder(status: OrderStatus, customerConfirmedAt: Date | null): boolean {
  if (!ORDER_IS_LIVE[status]) return false;
  // Delivered-and-confirmed is done, whatever the status column still says.
  return !(status === "DELIVERED" && customerConfirmedAt != null);
}

/** What the strip shows. Nothing here is a credential. */
export interface ActiveOrder {
  orderCode: string;
  /** The customer-facing step key, for the label and the progress dots. */
  statusKey: string;
  /** How far along, 0-1, for the bar. */
  progress: number;
  /** First name only — the rider's number is never any of this. */
  riderFirstName: string | null;
  /** Minutes, when there is enough to say. Null is said as "on its way". */
  etaMinutes: number | null;
}

/**
 * How far through the journey this is, as a fraction.
 *
 * Deliberately never returns 0 for a placed order: a bar with nothing in it
 * reads as "nothing is happening", and something is — we have the order.
 */
export function orderProgress(timeline: readonly string[], statusKey: string): number {
  const i = timeline.indexOf(statusKey);
  if (i < 0) return 0.08;
  return Math.max(0.08, (i + 1) / timeline.length);
}
