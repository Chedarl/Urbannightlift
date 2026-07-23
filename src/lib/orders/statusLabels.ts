/**
 * Customers only ever see one of 9 simple, friendly status labels.
 * Admin and rider views always show the raw detailed OrderStatus.
 */
import type { OrderStatus } from "@prisma/client";

export type CustomerStatusKey =
  | "received"
  | "review"
  | "payment"
  | "riderAssigned"
  | "pickup"
  | "collected"
  | "onTheWay"
  | "delivered"
  | "cancelled";

export const CUSTOMER_STATUS_KEY: Record<OrderStatus, CustomerStatusKey> = {
  NEW_REQUEST: "received",
  AWAITING_DISPATCHER_REVIEW: "review",
  APPROVED: "review",
  AWAITING_PAYMENT: "payment",
  PAYMENT_SUBMITTED: "payment",
  PAYMENT_VERIFIED: "riderAssigned",
  RIDER_ASSIGNED: "riderAssigned",
  RIDER_GOING_TO_PICKUP: "pickup",
  RIDER_ARRIVED_AT_PICKUP: "pickup",
  ITEM_COLLECTED: "collected",
  RIDER_GOING_TO_DELIVERY: "onTheWay",
  RIDER_ARRIVED_AT_DELIVERY: "onTheWay",
  DELIVERY_PROOF_SUBMITTED: "onTheWay",
  DELIVERED: "delivered",
  CLOSED: "delivered",
  CANCELLED_BY_CUSTOMER: "cancelled",
  CANCELLED_BY_UNL: "cancelled",
  REJECTED: "cancelled",
  FAILED_DELIVERY: "cancelled",
  CUSTOMER_UNREACHABLE: "onTheWay",
  MERCHANT_UNAVAILABLE: "review",
  SAFETY_HOLD: "review",
  REFUND_PENDING: "cancelled",
  REFUNDED: "cancelled",
};

/** i18n dictionary key for a customer-facing status (use with t()). */
export function customerStatusDictKey(status: OrderStatus): string {
  return `customerStatus.${CUSTOMER_STATUS_KEY[status]}`;
}

/** Human-ish formatting of a raw detailed status for staff views. */
export function formatDetailedStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** The ordered customer-facing timeline used on the confirmation screen. */
export const CUSTOMER_TIMELINE: CustomerStatusKey[] = [
  "received",
  "review",
  "payment",
  "riderAssigned",
  "pickup",
  "collected",
  "onTheWay",
  "delivered",
];
