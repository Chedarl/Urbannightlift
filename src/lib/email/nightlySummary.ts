import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { sendEmail } from "@/lib/email/send";
import { ADMIN, escape, shell, type Field } from "@/lib/email/templates";
import { formatXaf } from "@/lib/utils";

/**
 * One email after the night closes.
 *
 * This is the half of the ask that actually compounds. An email per order tells
 * you an order happened; it does not tell you whether the business is working.
 * At thirty orders a night the per-order mail becomes noise and stops being
 * read, and the owner is no better informed than before — which is why that one
 * can be switched off and this one is meant to be kept.
 *
 * It answers four questions, in the order they matter: did we earn, did we
 * deliver, is anything stuck, and are we growing. Everything is counted from
 * the same rows the accounts are built from, and test orders are excluded, so
 * the figures here and the figures in the earnings screen cannot disagree.
 */

/** Yaoundé is UTC+1 with no daylight saving, and the night runs 6 PM → 4 AM. */
const YAOUNDE_OFFSET_HOURS = 1;

/** A delivery is finished whether or not the paperwork has been closed off. */
const COMPLETED: OrderStatus[] = ["DELIVERED", "CLOSED"];
/** Everything that means the customer did not get their order. */
const FELL_THROUGH: OrderStatus[] = [
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "FAILED_DELIVERY",
  "REJECTED",
];

export function lastNightWindow(now = new Date()): { from: Date; to: Date; label: string } {
  const local = new Date(now.getTime() + YAOUNDE_OFFSET_HOURS * 3600_000);
  // Run after the 4 AM close, so "last night" started at 6 PM the previous day.
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1, 18 - YAOUNDE_OFFSET_HOURS));
  const end = new Date(start.getTime() + 10 * 3600_000); // 6 PM → 4 AM
  const label = new Date(start.getTime() + YAOUNDE_OFFSET_HOURS * 3600_000).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return { from: start, to: end, label };
}

export async function sendNightlySummary(now = new Date()): Promise<{ sent: boolean; reason?: string }> {
  const settings = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: { dailySummaryEmail: true, riderSharePercent: true },
  });
  if (settings && settings.dailySummaryEmail === false) return { sent: false, reason: "disabled" };

  const { from, to, label } = lastNightWindow(now);
  const realOrders = { createdAt: { gte: from, lt: to }, isTest: false };

  const [orders, delivered, cancelled, newCustomers, pendingRiders, pendingAmbassadors, pendingMerchants, unpricedNow, awaitingPaymentNow] =
    await Promise.all([
      prisma.order.findMany({
        where: realOrders,
        select: {
          orderStatus: true,
          finalDeliveryFeeXaf: true,
          quotedFeeXaf: true,
          estimatedDeliveryFeeXaf: true,
          riderPayoutXaf: true,
          ambassadorCommissionXaf: true,
          discountXaf: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.order.count({ where: { ...realOrders, orderStatus: { in: COMPLETED } } }),
      prisma.order.count({ where: { ...realOrders, orderStatus: { in: FELL_THROUGH } } }),
      prisma.customer.count({ where: { createdAt: { gte: from, lt: to } } }),
      prisma.riderApplication.count({ where: { status: "PENDING" } }),
      prisma.ambassador.count({ where: { status: "PENDING" } }),
      prisma.merchant.count({ where: { verified: false, source: "signup" } }),
      // Not time-boxed: anything still stuck is a problem now, whenever it started.
      prisma.order.count({ where: { isTest: false, orderStatus: "AWAITING_DISPATCHER_REVIEW" } }),
      prisma.order.count({ where: { isTest: false, quoteAcceptedAt: { not: null }, paymentStatus: { not: "VERIFIED" }, paymentMethod: { not: "CASH" } } }),
    ]);

  const fee = (o: (typeof orders)[number]) =>
    o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? o.estimatedDeliveryFeeXaf ?? 0;

  const deliveredOrders = orders.filter((o) => COMPLETED.includes(o.orderStatus));
  const revenue = deliveredOrders.reduce((s, o) => s + fee(o), 0);
  const riderPay = deliveredOrders.reduce((s, o) => s + (o.riderPayoutXaf ?? 0), 0);
  const commission = deliveredOrders.reduce((s, o) => s + (o.ambassadorCommissionXaf ?? 0), 0);
  const discounts = deliveredOrders.reduce((s, o) => s + (o.discountXaf ?? 0), 0);
  const companyShare = revenue - riderPay - commission - discounts;

  const times = deliveredOrders
    .filter((o) => o.completedAt)
    .map((o) => (o.completedAt!.getTime() - o.createdAt.getTime()) / 60000);
  const median = times.length ? Math.round([...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]) : null;

  const taken = orders.length;
  const completion = taken ? Math.round((delivered / taken) * 100) : 0;

  const money: Field[] = [
    { label: "Orders taken", value: String(taken) },
    { label: "Delivered", value: `${delivered}${taken ? ` (${completion}%)` : ""}` },
    { label: "Didn\u2019t complete", value: cancelled ? String(cancelled) : null },
    { label: "Delivery fees earned", value: formatXaf(revenue) },
    { label: "Paid to riders", value: formatXaf(riderPay) },
    { label: "Ambassador commission", value: commission ? formatXaf(commission) : null },
    { label: "Discounts given", value: discounts ? formatXaf(discounts) : null },
    { label: "Our share", value: formatXaf(companyShare) },
    { label: "Typical time to deliver", value: median != null ? `${median} minutes` : null },
    { label: "New customers", value: newCustomers ? String(newCustomers) : null },
  ];

  const waiting: string[] = [
    unpricedNow ? `${unpricedNow} order${unpricedNow === 1 ? "" : "s"} still waiting for a price` : "",
    awaitingPaymentNow ? `${awaitingPaymentNow} accepted quote${awaitingPaymentNow === 1 ? "" : "s"} not yet paid` : "",
    pendingRiders ? `${pendingRiders} rider application${pendingRiders === 1 ? "" : "s"} to review` : "",
    pendingAmbassadors ? `${pendingAmbassadors} ambassador${pendingAmbassadors === 1 ? "" : "s"} waiting for approval` : "",
    pendingMerchants ? `${pendingMerchants} business${pendingMerchants === 1 ? "" : "es"} waiting to be verified` : "",
  ].filter(Boolean);

  const heading = taken === 0 ? "A quiet night" : `${taken} order${taken === 1 ? "" : "s"} last night`;
  const subheading =
    taken === 0
      ? "Nothing came in between 6 PM and 4 AM."
      : `${label} · 6 PM to 4 AM · our share ${formatXaf(companyShare)}`;

  const html = shell({
    heading,
    subheading,
    fields: money,
    note: waiting.length ? `Needs you today: ${waiting.join("; ")}.` : undefined,
    actionLabel: "Open the dashboard",
    actionUrl: ADMIN.dashboard(),
    footnote: "Test orders are excluded, so these are the same figures as the earnings screen.",
  });

  const text = [
    `URBAN NIGHT LIFT — ${heading}`,
    subheading,
    "",
    ...money.filter((f) => f.value).map((f) => `${f.label}: ${f.value}`),
    "",
    waiting.length ? `Needs you today: ${waiting.join("; ")}.` : "",
    "",
    ADMIN.dashboard(),
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendEmail({
    subject: `Last night: ${taken} order${taken === 1 ? "" : "s"}, ${formatXaf(companyShare)} our share`,
    html,
    text,
    event: "summary.nightly",
    entityType: "summary",
    entityId: from.toISOString().slice(0, 10),
  });

  return { sent: result.ok, reason: result.error };
}

/** Exported for the verification script, which asserts the wording stays honest. */
export function summaryHeadline(taken: number): string {
  return taken === 0 ? "A quiet night" : `${taken} order${taken === 1 ? "" : "s"} last night`;
}

export { escape };
