import type { OrderStatus } from "@prisma/client";

/**
 * Who may call whom, and when.
 *
 * ## The rule this has to live inside
 *
 * The customer is **never** shown the rider's phone number. That is stated in
 * five places including the published privacy policy, and
 * `RiderIdentityCard.tsx` gives the reason: *"Handing out a rider's personal
 * number creates a channel we cannot moderate."*
 *
 * An in-app call is the way through that objection rather than around it. The
 * two browsers are introduced by the server, neither learns a number, the call
 * is logged, and it can be switched off. It is the moderatable channel the rule
 * was asking for.
 *
 * ## Why the table is exhaustive
 *
 * `satisfies Record<OrderStatus, boolean>` means **adding a status to the enum
 * fails the build**. The alternative — "callable unless cancelled" — would have
 * silently opened a voice channel on `SAFETY_HOLD`, which is precisely the
 * state where an unmoderated call between two people is least wanted. Somebody
 * has to decide, per status, in this file.
 */
const CALLABLE = {
  // Nothing to say yet: no rider, or no rider who has accepted.
  NEW_REQUEST: false,
  AWAITING_DISPATCHER_REVIEW: false,
  APPROVED: false,
  AWAITING_PAYMENT: false,
  PAYMENT_SUBMITTED: false,
  PAYMENT_VERIFIED: false,

  // A named person is on this order. This is the window.
  RIDER_ASSIGNED: true,
  RIDER_GOING_TO_PICKUP: true,
  RIDER_ARRIVED_AT_PICKUP: true,
  ITEM_COLLECTED: true,
  RIDER_GOING_TO_DELIVERY: true,
  RIDER_ARRIVED_AT_DELIVERY: true,
  DELIVERY_PROOF_SUBMITTED: true,

  /*
    Delivered, with a grace period the caller applies.

    "He left it with the guard — which guard?" is a real one-in-the-morning
    call, and it happens in the minutes after a rider marks something done. The
    window closes at `GRACE_AFTER_DELIVERED_MINUTES`, or the moment the customer
    confirms they have it, whichever comes first.
  */
  DELIVERED: true,

  // Over.
  CLOSED: false,
  REJECTED: false,
  CANCELLED_BY_CUSTOMER: false,
  CANCELLED_BY_UNL: false,
  FAILED_DELIVERY: false,
  REFUND_PENDING: false,
  REFUNDED: false,

  /*
    Stopped, and a person is already involved.

    On a safety hold or an unreachable customer there is a dispatcher working
    the problem. Opening a direct line between the two parties at that moment
    routes around the person who is handling it — and on a safety hold that is
    the whole point of the hold.
  */
  SAFETY_HOLD: false,
  CUSTOMER_UNREACHABLE: false,
  MERCHANT_UNAVAILABLE: false,
} satisfies Record<OrderStatus, boolean>;

export const GRACE_AFTER_DELIVERED_MINUTES = 15;

export type CallParty = "CUSTOMER" | "RIDER";

export type CallDenyReason =
  | "OK"
  | "NO_RIDER"
  | "NOT_ACCEPTED"
  | "STATUS_CLOSED"
  | "NOT_YOUR_ORDER"
  | "TOO_LATE"
  | "DISABLED";

export interface CanCallInput {
  orderStatus: OrderStatus;
  assignedRiderId: string | null;
  riderAcceptedAt: Date | null;
  deliveredAt: Date | null;
  customerConfirmedAt: Date | null;
  /** Who is asking. */
  party: CallParty;
  /** Their id: a `User.id` for a rider, a `Customer.id` for a customer. */
  actorId: string;
  orderCustomerId: string;
  /** The owner's switch, same shape as `voiceOrderingEnabled`. */
  enabled: boolean;
  now: Date;
}

/**
 * Whether this person may open a call on this order, right now.
 *
 * Pure, and it returns a reason rather than a boolean so the screen can say
 * something true — "he hasn't accepted the job yet" is a different sentence
 * from "this order is finished", and both are better than a greyed-out button.
 */
export function canCall(input: CanCallInput): { ok: boolean; reason: CallDenyReason } {
  if (!input.enabled) return { ok: false, reason: "DISABLED" };

  // Identity first: the cheapest check, and the one that must never be skipped.
  const isOwner =
    input.party === "RIDER"
      ? input.assignedRiderId != null && input.actorId === input.assignedRiderId
      : input.actorId === input.orderCustomerId;
  if (!isOwner) return { ok: false, reason: "NOT_YOUR_ORDER" };

  if (!input.assignedRiderId) return { ok: false, reason: "NO_RIDER" };
  /*
    An offered job is not a relationship.

    A rider can be assigned and not have accepted — the order sits in their
    queue. Calling the customer from a job you have not taken, or being called
    by one, is a conversation neither party has agreed to.
  */
  if (!input.riderAcceptedAt) return { ok: false, reason: "NOT_ACCEPTED" };

  if (!CALLABLE[input.orderStatus]) return { ok: false, reason: "STATUS_CLOSED" };

  if (input.orderStatus === "DELIVERED") {
    if (input.customerConfirmedAt) return { ok: false, reason: "TOO_LATE" };
    if (!input.deliveredAt) return { ok: false, reason: "TOO_LATE" };
    const minutes = (input.now.getTime() - input.deliveredAt.getTime()) / 60_000;
    if (minutes > GRACE_AFTER_DELIVERED_MINUTES) return { ok: false, reason: "TOO_LATE" };
  }

  return { ok: true, reason: "OK" };
}

/**
 * Ring, or ask for a call back.
 *
 * **The rider is on a motorbike.** Ringing somebody mid-ride is a safety event,
 * not a UX event: they either ignore it, or they answer it, and the second is
 * worse. So while the rider is in motion the customer's tap sends a
 * notification — "your customer would like a word" — and the rider calls back
 * when they are stopped. A direct ring is offered only when they have arrived
 * somewhere, which is also when almost every real call happens: *"I'm at the
 * gate, which building?"*
 *
 * Rider-initiated calls are not gated this way. A rider who chooses to stop and
 * call is making that decision for themselves, which is theirs to make.
 */
export function ringMode(status: OrderStatus): "RING" | "REQUEST_CALLBACK" {
  return status === "RIDER_GOING_TO_PICKUP" || status === "RIDER_GOING_TO_DELIVERY"
    ? "REQUEST_CALLBACK"
    : "RING";
}

/** Exposed for the suite, which asserts every status is classified. */
export const CALLABLE_STATUSES = CALLABLE;
