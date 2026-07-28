import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { visibilityWhere } from "@/lib/orders/filters";
import { DashboardStats } from "@/components/admin/DashboardStats";

export const dynamic = "force-dynamic";

/** How long something may sit unattended before dispatch is told about it. */
const REVIEW_SLA_MINUTES = 10;
const ASSIGNMENT_SLA_MINUTES = 5;

const ACTIVE_STATUSES = [
  "RIDER_ASSIGNED",
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
];

export default async function AdminDashboardPage() {
  const settings = await getOperatingSettings();
  const { start, end } = tonightWindow(settings.operatingStartHour);
  // During a pre-launch rehearsal the orders being placed ARE test orders, so
  // the dashboard has to show them or the owner sees an empty console and
  // concludes the site is broken. They stay flagged and excluded from
  // earnings; this only affects what dispatch can see tonight.
  const visible = visibilityWhere(false, settings.testMode);
  const now = Date.now();
  const reviewCutoff = new Date(now - REVIEW_SLA_MINUTES * 60_000);
  const assignmentCutoff = new Date(now - ASSIGNMENT_SLA_MINUTES * 60_000);

  const [tonightOrders, rider, attention] = await Promise.all([
    prisma.order.findMany({
      where: { ...visible, createdAt: { gte: start, lt: end } },
      select: {
        orderStatus: true,
        paymentStatus: true,
        finalDeliveryFeeXaf: true,
        estimatedDeliveryFeeXaf: true,
      },
    }),
    prisma.user.findFirst({
      where: { role: "RIDER", status: "ACTIVE" },
      select: { fullName: true },
    }),
    // The needs-attention queue. Deliberately not limited to tonight: an order
    // stuck since yesterday is exactly the one you must not lose sight of.
    prisma.order.findMany({
      where: {
        ...visible,
        OR: [
          // Waiting on a dispatcher to review and price it.
          { orderStatus: "AWAITING_DISPATCHER_REVIEW", createdAt: { lt: reviewCutoff } },
          // The customer says they paid and nobody has verified it.
          { paymentStatus: "SUBMITTED_UNVERIFIED" },
          // Priced, but the customer has not answered the quote.
          { quoteSentAt: { not: null }, quoteAcceptedAt: null, quoteDeclinedAt: null },
          // Priced and nobody has told them — the quote is waiting on us, not them.
          { quoteSentAt: { not: null }, customerNotifiedAt: null },
          // Paid and ready, with no rider on it.
          { orderStatus: "PAYMENT_VERIFIED", assignedRiderId: null },
          // Assigned, but the rider has not accepted.
          { assignedRiderId: { not: null }, riderAcceptedAt: null, assignedAt: { lt: assignmentCutoff } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        orderCode: true,
        createdAt: true,
        orderStatus: true,
        paymentStatus: true,
        quoteSentAt: true,
        quoteAcceptedAt: true,
        quoteDeclinedAt: true,
        customerNotifiedAt: true,
        assignedRiderId: true,
        assignedAt: true,
        riderAcceptedAt: true,
        customer: { select: { fullName: true } },
        assignedRider: { select: { fullName: true } },
      },
    }),
  ]);

  /** The single most urgent thing wrong with an order, in escalation order. */
  const attentionRows = attention.map((o) => {
    let kind: string;
    if (o.quoteSentAt && !o.customerNotifiedAt) kind = "CUSTOMER_NOT_TOLD";
    else if (o.paymentStatus === "SUBMITTED_UNVERIFIED") kind = "PAYMENT_UNVERIFIED";
    else if (o.assignedRiderId && !o.riderAcceptedAt) kind = "RIDER_SILENT";
    else if (o.orderStatus === "PAYMENT_VERIFIED" && !o.assignedRiderId) kind = "NO_RIDER";
    else if (o.quoteSentAt && !o.quoteAcceptedAt && !o.quoteDeclinedAt) kind = "QUOTE_UNANSWERED";
    else kind = "UNREVIEWED";

    const since = kind === "RIDER_SILENT" && o.assignedAt ? o.assignedAt : o.createdAt;
    return {
      id: o.id,
      orderCode: o.orderCode,
      customerName: o.customer.fullName,
      riderName: o.assignedRider?.fullName ?? null,
      kind,
      waitingMinutes: Math.max(0, Math.round((now - since.getTime()) / 60_000)),
    };
  });

  const stats = {
    total: tonightOrders.length,
    pendingReview: tonightOrders.filter((o) => o.orderStatus === "AWAITING_DISPATCHER_REVIEW").length,
    awaitingPayment: tonightOrders.filter((o) =>
      ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED"].includes(o.orderStatus)
    ).length,
    assigned: tonightOrders.filter((o) => o.orderStatus === "RIDER_ASSIGNED").length,
    inProgress: tonightOrders.filter((o) => ACTIVE_STATUSES.includes(o.orderStatus)).length,
    delivered: tonightOrders.filter((o) => ["DELIVERED", "CLOSED"].includes(o.orderStatus)).length,
    cancelled: tonightOrders.filter((o) =>
      ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "REJECTED", "FAILED_DELIVERY"].includes(o.orderStatus)
    ).length,
    revenue: tonightOrders
      .filter((o) => o.paymentStatus === "VERIFIED")
      .reduce((sum, o) => sum + (o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf ?? 0), 0),
    riderActive: tonightOrders.some((o) => ACTIVE_STATUSES.includes(o.orderStatus)),
    riderName: rider?.fullName ?? "—",
    testMode: settings.testMode,
  };

  return <DashboardStats stats={stats} mode={settings.mode} attention={attentionRows} />;
}
