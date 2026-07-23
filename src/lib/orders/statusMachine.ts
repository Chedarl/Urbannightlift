/**
 * Order status state machine — the exact 15-step workflow from the business
 * spec plus alternative/terminal statuses. Every transition goes through
 * isTransitionAllowed(); the status API writes one OrderStatusHistory row per
 * transition inside a transaction.
 */
import type { OrderStatus, UserRole } from "@prisma/client";

export const HAPPY_PATH: OrderStatus[] = [
  "NEW_REQUEST",
  "AWAITING_DISPATCHER_REVIEW",
  "APPROVED",
  "AWAITING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "RIDER_ASSIGNED",
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
  "DELIVERED",
  "CLOSED",
];

/** Statuses from which the dispatcher can still cancel / hold the order. */
const ADMIN_ESCAPES: OrderStatus[] = [
  "CANCELLED_BY_UNL",
  "REJECTED",
  "SAFETY_HOLD",
  "CUSTOMER_UNREACHABLE",
  "MERCHANT_UNAVAILABLE",
];

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW_REQUEST: ["AWAITING_DISPATCHER_REVIEW", "CANCELLED_BY_CUSTOMER", ...ADMIN_ESCAPES],
  AWAITING_DISPATCHER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED_BY_CUSTOMER", ...ADMIN_ESCAPES],
  APPROVED: ["AWAITING_PAYMENT", "CANCELLED_BY_CUSTOMER", ...ADMIN_ESCAPES],
  AWAITING_PAYMENT: ["PAYMENT_SUBMITTED", "PAYMENT_VERIFIED", "CANCELLED_BY_CUSTOMER", ...ADMIN_ESCAPES],
  PAYMENT_SUBMITTED: ["PAYMENT_VERIFIED", "AWAITING_PAYMENT", "CANCELLED_BY_CUSTOMER", ...ADMIN_ESCAPES],
  PAYMENT_VERIFIED: ["RIDER_ASSIGNED", "REFUND_PENDING", ...ADMIN_ESCAPES],
  RIDER_ASSIGNED: ["RIDER_GOING_TO_PICKUP", "REFUND_PENDING", ...ADMIN_ESCAPES],
  RIDER_GOING_TO_PICKUP: ["RIDER_ARRIVED_AT_PICKUP", "FAILED_DELIVERY", ...ADMIN_ESCAPES],
  RIDER_ARRIVED_AT_PICKUP: ["ITEM_COLLECTED", "FAILED_DELIVERY", ...ADMIN_ESCAPES],
  ITEM_COLLECTED: ["RIDER_GOING_TO_DELIVERY", "FAILED_DELIVERY", ...ADMIN_ESCAPES],
  RIDER_GOING_TO_DELIVERY: ["RIDER_ARRIVED_AT_DELIVERY", "FAILED_DELIVERY", ...ADMIN_ESCAPES],
  RIDER_ARRIVED_AT_DELIVERY: ["DELIVERY_PROOF_SUBMITTED", "DELIVERED", "FAILED_DELIVERY", "CUSTOMER_UNREACHABLE", ...ADMIN_ESCAPES],
  DELIVERY_PROOF_SUBMITTED: ["DELIVERED", "FAILED_DELIVERY", ...ADMIN_ESCAPES],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED_BY_CUSTOMER: ["REFUND_PENDING"],
  CANCELLED_BY_UNL: ["REFUND_PENDING"],
  REJECTED: ["AWAITING_DISPATCHER_REVIEW", "REFUND_PENDING"],
  FAILED_DELIVERY: ["REFUND_PENDING", "RIDER_GOING_TO_DELIVERY", "CANCELLED_BY_UNL"],
  CUSTOMER_UNREACHABLE: ["RIDER_GOING_TO_DELIVERY", "FAILED_DELIVERY", "REFUND_PENDING", "CANCELLED_BY_UNL"],
  MERCHANT_UNAVAILABLE: ["AWAITING_DISPATCHER_REVIEW", "REFUND_PENDING", "CANCELLED_BY_UNL"],
  SAFETY_HOLD: ["AWAITING_DISPATCHER_REVIEW", "CANCELLED_BY_UNL"],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

/** Statuses only the assigned rider may set (their delivery execution steps). */
export const RIDER_STATUSES: OrderStatus[] = [
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
  "DELIVERED",
];

/** Statuses reserved for dispatch decisions (never set by riders). */
const ADMIN_ONLY_STATUSES: OrderStatus[] = [
  "APPROVED",
  "REJECTED",
  "AWAITING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "RIDER_ASSIGNED",
  "CANCELLED_BY_UNL",
  "SAFETY_HOLD",
  "REFUND_PENDING",
  "REFUNDED",
  "CLOSED",
  "MERCHANT_UNAVAILABLE",
];

export function isTransitionAllowed(
  current: OrderStatus,
  next: OrderStatus,
  actorRole: UserRole | "SYSTEM" | "CUSTOMER"
): boolean {
  if (!ALLOWED_TRANSITIONS[current]?.includes(next)) return false;
  if (actorRole === "SYSTEM") return true;
  if (actorRole === "CUSTOMER") return next === "CANCELLED_BY_CUSTOMER";
  if (actorRole === "RIDER") {
    // Riders execute delivery steps and may flag delivery-time problems.
    return (
      RIDER_STATUSES.includes(next) ||
      next === "FAILED_DELIVERY" ||
      next === "CUSTOMER_UNREACHABLE"
    );
  }
  // OWNER / DISPATCHER / SUPPORT can drive everything except rider execution
  // steps... in a one-rider MVP the dispatcher may need to correct statuses,
  // so staff are allowed all valid transitions.
  return true;
}

export const TERMINAL_STATUSES: OrderStatus[] = [
  "CLOSED",
  "REFUNDED",
];

export { ADMIN_ONLY_STATUSES };
