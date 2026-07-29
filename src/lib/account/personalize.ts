import type { OrderStatus, ServiceType } from "@prisma/client";
import { yaoundeHour } from "@/lib/orders/tonight";

/**
 * What makes the portal *theirs*.
 *
 * A ride app you keep opening does not greet everyone the same way. Yango and
 * Uber both lead with what you personally are most likely to want next — your
 * usual, where you go, the trip you are already on — and only then show the
 * full menu. This module is the small amount of arithmetic that lets the portal
 * do the same: read the customer's own history and the hour of the night, and
 * decide what to put first.
 *
 * Pure and deterministic, so the same customer at the same time always sees the
 * same portal, and so it can be tested without a database or a browser.
 */

/** Orders that are still someone's problem tonight — the "active trip". */
const IN_FLIGHT: OrderStatus[] = [
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
];

const DELIVERED: OrderStatus[] = ["DELIVERED", "CLOSED"];

/**
 * The greeting, by the hour it actually is in Yaoundé — not on the server,
 * which runs in UTC and would wish somebody good evening at lunchtime.
 *
 * This is a night service, so the vocabulary leans into the night rather than
 * pretending it is a daytime app: most sessions happen between 6 PM and 4 AM.
 */
export function greeting(fr: boolean, now: Date = new Date()): string {
  const h = yaoundeHour(now);
  if (h >= 5 && h < 12) return fr ? "Bonjour" : "Good morning";
  if (h >= 12 && h < 17) return fr ? "Bon après-midi" : "Good afternoon";
  if (h >= 17 && h < 22) return fr ? "Bonsoir" : "Good evening";
  return fr ? "Bonne nuit" : "Good night";
}

/** 1st, 2nd, 3rd … including the 11th–13th, which break the rule. */
export function ordinal(n: number, fr: boolean): string {
  if (fr) return n === 1 ? "1re" : `${n}e`;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * A line that acknowledges the relationship, sized to how much of one there is.
 * A stranger is welcomed; a regular is told which night this is; the best
 * customers are told they are known.
 */
export function relationshipLine(nights: number, fr: boolean): string {
  if (nights <= 0) return fr ? "Bienvenue chez Urban Night Lift." : "Welcome to Urban Night Lift.";
  if (nights === 1) return fr ? "Content de vous revoir." : "Good to see you back.";
  const nth = ordinal(nights + 1, fr);
  return fr ? `C'est votre ${nth} nuit avec nous.` : `This is your ${nth} night with us.`;
}

export interface OrderLike {
  orderCode: string;
  orderStatus: OrderStatus;
  serviceType: ServiceType;
  createdAt: Date | string;
}

function time(v: Date | string): number {
  return (v instanceof Date ? v : new Date(v)).getTime();
}

/**
 * The order the customer is currently living through, if any — the thing that
 * belongs at the very top of the portal, the way an in-progress trip does in a
 * ride app. The most recent in-flight order wins.
 */
export function activeOrder<T extends OrderLike>(orders: T[]): T | null {
  const live = orders
    .filter((o) => IN_FLIGHT.includes(o.orderStatus))
    .sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return live[0] ?? null;
}

/**
 * The service they reach for most, from delivered orders only — a cancelled
 * attempt is not a preference. This is what "your usual" is built from, and
 * what the portal offers as the one-tap first tile.
 */
export function favoriteService<T extends OrderLike>(orders: T[]): ServiceType | null {
  const counts = new Map<ServiceType, number>();
  for (const o of orders) {
    if (!DELIVERED.includes(o.orderStatus)) continue;
    counts.set(o.serviceType, (counts.get(o.serviceType) ?? 0) + 1);
  }
  let best: ServiceType | null = null;
  let bestN = 0;
  for (const [service, n] of counts) {
    if (n > bestN) {
      best = service;
      bestN = n;
    }
  }
  return best;
}

/** How many nights they have actually completed — the denominator of loyalty. */
export function completedNights<T extends OrderLike>(orders: T[]): number {
  return orders.filter((o) => DELIVERED.includes(o.orderStatus)).length;
}

/**
 * The single most useful thing to offer this customer right now, decided once
 * so the portal has one clear hero rather than three competing calls to action.
 *
 *   TRACK   — you have a delivery in progress; watch it
 *   REORDER — you have a usual; here it is, one tap
 *   START   — you are new; here is the menu
 */
export type PrimaryIntent = "TRACK" | "REORDER" | "START";

export function primaryIntent<T extends OrderLike>(orders: T[]): PrimaryIntent {
  if (activeOrder(orders)) return "TRACK";
  if (orders.some((o) => DELIVERED.includes(o.orderStatus))) return "REORDER";
  return "START";
}

export function isDelivered(status: OrderStatus): boolean {
  return DELIVERED.includes(status);
}

export function isInFlight(status: OrderStatus): boolean {
  return IN_FLIGHT.includes(status);
}
