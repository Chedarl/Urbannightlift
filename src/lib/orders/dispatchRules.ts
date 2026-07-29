import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

/**
 * The order of operations, in one place.
 *
 * An order used to be able to reach a rider through several different doors:
 * assignment only checked that the price had been agreed, verifying a payment
 * left the order sitting in AWAITING_PAYMENT, and the admin screen offered
 * payment verification above pricing — so the screen taught the opposite of the
 * sequence the money actually follows. Each surface had its own idea of what
 * came next.
 *
 * Everything now asks these functions instead: the assignment endpoint, the
 * dispatch console, and the customer's own page. If they disagree about whether
 * an order is ready to go out, that is a bug in one place rather than three.
 */

export type Stage =
  | "REVIEW"
  | "PRICED"
  | "ACCEPTED"
  | "PAID"
  | "DISPATCHED"
  | "DELIVERED"
  | "CLOSED"
  | "STOPPED";

export interface OrderGateState {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  quoteSentAt: Date | string | null;
  quoteAcceptedAt: Date | string | null;
  quoteDeclinedAt: Date | string | null;
  assignedRiderId: string | null;
  customerConfirmedAt: Date | string | null;
}

const STOPPED: OrderStatus[] = [
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "REJECTED",
  "FAILED_DELIVERY",
  "REFUND_PENDING",
  "REFUNDED",
  "SAFETY_HOLD",
];

const OUT_WITH_RIDER: OrderStatus[] = [
  "RIDER_ASSIGNED",
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
];

/**
 * Cash on delivery has nothing to verify before the rider leaves — the money is
 * handed over at the door. Gating it on a verified payment would deadlock every
 * cash order, so it is settled afterwards through the rider's cash balance
 * instead.
 */
export function isPayOnDelivery(paymentMethod: PaymentMethod): boolean {
  return paymentMethod === "CASH";
}

/** Where this order has actually got to, whatever its raw status says. */
export function stageOf(o: OrderGateState): Stage {
  if (STOPPED.includes(o.orderStatus)) return "STOPPED";
  if (o.orderStatus === "CLOSED") return "CLOSED";
  if (o.orderStatus === "DELIVERED" || o.customerConfirmedAt) return "DELIVERED";
  if (o.assignedRiderId && OUT_WITH_RIDER.includes(o.orderStatus)) return "DISPATCHED";
  if (isPaidUp(o)) return "PAID";
  if (o.quoteAcceptedAt) return "ACCEPTED";
  // A declined price is back with us, not with the customer — it needs
  // re-pricing before anything else can happen.
  if (o.quoteSentAt && !o.quoteDeclinedAt) return "PRICED";
  return "REVIEW";
}

/** Has the money side been settled as far as it can be before dispatch? */
export function isPaidUp(o: OrderGateState): boolean {
  if (!o.quoteAcceptedAt) return false;
  return o.paymentStatus === "VERIFIED" || isPayOnDelivery(o.paymentMethod);
}

export interface Blocker {
  code: "STOPPED" | "NOT_PRICED" | "QUOTE_NOT_ACCEPTED" | "QUOTE_DECLINED" | "PAYMENT_NOT_VERIFIED";
  /** Written for the dispatcher reading it, not for a log. */
  message: string;
}

/**
 * Why this order cannot go to a rider yet, or null when it can.
 *
 * The rule the owner asked for: nobody rides until the customer has agreed the
 * price *and* the money is in — except on cash orders, where the money arrives
 * with the rider.
 */
export function dispatchBlocker(o: OrderGateState): Blocker | null {
  if (STOPPED.includes(o.orderStatus)) {
    return { code: "STOPPED", message: "This order is cancelled or on hold." };
  }
  if (o.quoteDeclinedAt) {
    return { code: "QUOTE_DECLINED", message: "The customer declined the price. Re-price it before dispatching." };
  }
  if (!o.quoteSentAt) {
    return { code: "NOT_PRICED", message: "Price the order and send the customer the link first." };
  }
  if (!o.quoteAcceptedAt) {
    return {
      code: "QUOTE_NOT_ACCEPTED",
      message: "The customer hasn't accepted the price yet — send them the quote link.",
    };
  }
  if (!isPaidUp(o)) {
    return {
      code: "PAYMENT_NOT_VERIFIED",
      message:
        o.paymentStatus === "SUBMITTED_UNVERIFIED"
          ? "The customer says they've paid — check the proof and verify it before dispatching."
          : "Waiting for payment. No rider goes out until the money is verified.",
    };
  }
  return null;
}

export function canDispatch(o: OrderGateState): boolean {
  return dispatchBlocker(o) === null;
}

/** What the customer should be doing right now, if anything. */
export function customerNextStep(o: OrderGateState): "WAIT" | "ACCEPT_QUOTE" | "PAY" | "CONFIRM_RECEIPT" | "NONE" {
  const stage = stageOf(o);
  if (stage === "STOPPED" || stage === "CLOSED") return "NONE";
  if (stage === "DELIVERED") return o.customerConfirmedAt ? "NONE" : "CONFIRM_RECEIPT";
  if (stage === "DISPATCHED") return "CONFIRM_RECEIPT";
  if (stage === "PRICED") return o.quoteDeclinedAt ? "NONE" : "ACCEPT_QUOTE";
  if (stage === "ACCEPTED") return isPayOnDelivery(o.paymentMethod) ? "WAIT" : "PAY";
  return "WAIT";
}

/** The stages a customer sees, in order, for a progress display. */
export const CUSTOMER_STAGES: { stage: Stage; en: string; fr: string }[] = [
  { stage: "REVIEW", en: "Order received", fr: "Commande reçue" },
  { stage: "PRICED", en: "Price sent", fr: "Prix envoyé" },
  { stage: "ACCEPTED", en: "Price accepted", fr: "Prix accepté" },
  { stage: "PAID", en: "Payment confirmed", fr: "Paiement confirmé" },
  { stage: "DISPATCHED", en: "Rider on the way", fr: "Livreur en route" },
  { stage: "DELIVERED", en: "Delivered", fr: "Livré" },
];

export function stageIndex(stage: Stage): number {
  const i = CUSTOMER_STAGES.findIndex((s) => s.stage === stage);
  return i === -1 ? CUSTOMER_STAGES.length - 1 : i;
}
