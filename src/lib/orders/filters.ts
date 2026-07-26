import type { Prisma, OrderStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/utils";

/** Admin order-table filters mapped to a Prisma where-clause. */
export type OrderFilter =
  | "ALL"
  | "NEW"
  | "AWAITING_REVIEW"
  | "AWAITING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "RIDER_ASSIGNED"
  | "PICKUP_IN_PROGRESS"
  | "ITEM_COLLECTED"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED"
  | "HIGH_VALUE"
  | "MEDICINE"
  | "RISK";

export const ORDER_FILTERS: OrderFilter[] = [
  "ALL",
  "NEW",
  "AWAITING_REVIEW",
  "AWAITING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "RIDER_ASSIGNED",
  "PICKUP_IN_PROGRESS",
  "ITEM_COLLECTED",
  "ON_THE_WAY",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
  "HIGH_VALUE",
  "MEDICINE",
  "RISK",
];

const STATUS_GROUPS: Partial<Record<OrderFilter, OrderStatus[]>> = {
  NEW: ["NEW_REQUEST"],
  AWAITING_REVIEW: ["AWAITING_DISPATCHER_REVIEW"],
  AWAITING_PAYMENT: ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED"],
  PAYMENT_CONFIRMED: ["PAYMENT_VERIFIED"],
  RIDER_ASSIGNED: ["RIDER_ASSIGNED"],
  PICKUP_IN_PROGRESS: ["RIDER_GOING_TO_PICKUP", "RIDER_ARRIVED_AT_PICKUP"],
  ITEM_COLLECTED: ["ITEM_COLLECTED"],
  ON_THE_WAY: ["RIDER_GOING_TO_DELIVERY", "RIDER_ARRIVED_AT_DELIVERY", "DELIVERY_PROOF_SUBMITTED"],
  DELIVERED: ["DELIVERED", "CLOSED"],
  CANCELLED: ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "FAILED_DELIVERY"],
  REJECTED: ["REJECTED"],
};

/**
 * Excludes test and archived orders. Applied to every operational view, count
 * and export, so the numbers describe the real business by default — the whole
 * point of having the flags. Pass includeHidden to look at them deliberately.
 */
export function visibilityWhere(includeHidden = false, includeTest = false): Prisma.OrderWhereInput {
  if (includeHidden) return {};
  // Archived orders are always hidden. Test orders are hidden unless asked
  // for — which test mode does, because hiding the orders you are rehearsing
  // with makes the console look broken at exactly the wrong moment.
  return includeTest ? { archivedAt: null } : { isTest: false, archivedAt: null };
}

export function buildOrderWhere(
  filter: OrderFilter,
  includeHidden = false,
  includeTest = false
): Prisma.OrderWhereInput {
  const visible = visibilityWhere(includeHidden, includeTest);
  if (filter === "HIGH_VALUE") return { ...visible, highValueFlag: true };
  if (filter === "MEDICINE") return { ...visible, isMedicine: true };
  if (filter === "RISK") return { ...visible, riskFlag: true };
  const group = STATUS_GROUPS[filter];
  if (group) return { ...visible, orderStatus: { in: group } };
  return visible;
}

export function normalizeFilter(value: string | null | undefined): OrderFilter {
  return ORDER_FILTERS.includes(value as OrderFilter) ? (value as OrderFilter) : "ALL";
}

/**
 * Free-text order lookup: order code, customer name, or phone number. Staff
 * previously had no way to find an order from a phone number, which is what a
 * customer gives on a call.
 */
export function buildOrderSearchWhere(query: string): Prisma.OrderWhereInput {
  const q = query.trim();
  if (!q) return {};

  const or: Prisma.OrderWhereInput[] = [
    { orderCode: { contains: q.toUpperCase() } },
    { customer: { fullName: { contains: q, mode: "insensitive" } } },
  ];

  const digits = q.replace(/[^\d]/g, "");
  if (digits.length >= 3) {
    or.push({ customer: { whatsappNumber: { contains: digits } } });
    const normalized = normalizePhone(q);
    if (normalized && normalized !== digits) {
      or.push({ customer: { whatsappNumber: { contains: normalized } } });
    }
  }

  return { OR: or };
}
