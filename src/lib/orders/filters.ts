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

export function buildOrderWhere(filter: OrderFilter): Prisma.OrderWhereInput {
  if (filter === "HIGH_VALUE") return { highValueFlag: true };
  if (filter === "MEDICINE") return { isMedicine: true };
  if (filter === "RISK") return { riskFlag: true };
  const group = STATUS_GROUPS[filter];
  if (group) return { orderStatus: { in: group } };
  return {};
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
