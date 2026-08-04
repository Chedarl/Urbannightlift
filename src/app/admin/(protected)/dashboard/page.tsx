import { prisma } from "@/lib/prisma";
import type { OrderStatus, ServiceType } from "@prisma/client";
import { getOperatingSettings } from "@/lib/settings";
import { SHOPPING_SERVICES, orderMoney } from "@/lib/orders/goodsMoney";
import { tonightWindow } from "@/lib/orders/tonight";
import { visibilityWhere } from "@/lib/orders/filters";
import { DashboardStats } from "@/components/admin/DashboardStats";
import { checkReceipt } from "@/lib/orders/receiptCheck";

export const dynamic = "force-dynamic";

/** How long something may sit unattended before dispatch is told about it. */
const REVIEW_SLA_MINUTES = 10;
const ASSIGNMENT_SLA_MINUTES = 5;
/**
 * A rider who is out on a job but whose position has not moved in this long has
 * lost tracking — screen asleep, permission revoked, or a phone off. The
 * customer is watching a frozen map, so dispatch should know before they call.
 */
const TRACKING_STALE_MINUTES = 15;

/** Statuses where a rider is physically out with the goods. */
const OUT_ON_THE_ROAD: OrderStatus[] = [
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
];

/**
 * Statuses from the moment a shopping rider has the goods in hand. Past this
 * point the receipt should exist: the payable is still the cap until it does, so
 * the customer is about to be asked for the wrong amount and the rider's advance
 * is not on the books.
 */
const GOODS_DUE_STATUSES: OrderStatus[] = [
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
  "DELIVERED",
];

/**
 * Finished orders. A money problem on one of these has either been dealt with
 * or is no longer dispatch's to chase, and closing an order is the dispatcher's
 * explicit "this is settled" — so it is also how a declined overspend stops
 * shouting once somebody has actually resolved it.
 */
const CLOSED_OUT: OrderStatus[] = [
  "CLOSED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "REJECTED",
  "REFUNDED",
];

/** The services where we buy things, widened for a Prisma `in` filter. */
const SHOPPING_SERVICE_TYPES: ServiceType[] = [...SHOPPING_SERVICES];

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
  const trackingCutoff = new Date(now - TRACKING_STALE_MINUTES * 60_000);

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
          // Out on the road with tracking that has gone quiet.
          {
            orderStatus: { in: OUT_ON_THE_ROAD },
            riderAcceptedAt: { not: null },
            OR: [{ riderLocationAt: null }, { riderLocationAt: { lt: trackingCutoff } }],
          },
          // The shop charged more than the customer agreed to and nobody has
          // answered yet. Until they do, the overage is not collectable.
          {
            goodsActualXaf: { gt: 0 },
            overCapApprovedAt: null,
            orderStatus: { notIn: CLOSED_OUT },
            OR: [
              { goodsCapXaf: null },
              { goodsActualXaf: { gt: prisma.order.fields.goodsCapXaf } },
            ],
          },
          // They answered, and the answer was no. The goods are already bought,
          // so this is real money sitting on a decision only dispatch can make.
          {
            overCapApprovedAt: { not: null },
            overCapApprovedXaf: null,
            orderStatus: { notIn: CLOSED_OUT },
          },
          // Shopping done, no receipt recorded — the payable is still the cap.
          {
            serviceType: { in: SHOPPING_SERVICE_TYPES },
            orderStatus: { in: GOODS_DUE_STATUSES },
            goodsActualXaf: null,
          },
          // The receipt photo was read and does not agree with what the rider
          // typed. Pulled in broadly here — whether the gap is big enough to
          // matter is decided by `checkReceipt` below, so the tolerance lives in
          // one place rather than being restated as a Prisma filter.
          {
            goodsActualXaf: { not: null },
            goodsReceiptReadXaf: { not: null },
            orderStatus: { notIn: CLOSED_OUT },
          },
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
        riderLocationAt: true,
        serviceType: true,
        estimatedDeliveryFeeXaf: true,
        finalDeliveryFeeXaf: true,
        goodsCapXaf: true,
        goodsActualXaf: true,
        goodsRecordedAt: true,
        goodsReceiptReadXaf: true,
        overCapApprovedXaf: true,
        overCapApprovedAt: true,
        customer: { select: { fullName: true } },
        assignedRider: { select: { fullName: true } },
      },
    }),
  ]);

  /** The single most urgent thing wrong with an order, in escalation order. */
  const attentionRows = attention.map((o) => {
    // The panel must not have its own opinion about what money is owed — it
    // reads the same module the receipt and the payable read, so dispatch can
    // never be told one figure while the customer is shown another.
    const money = orderMoney({
      serviceType: o.serviceType,
      deliveryFeeXaf: o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf,
      goodsCapXaf: o.goodsCapXaf,
      goodsActualXaf: o.goodsActualXaf,
      overCapApprovedXaf: o.overCapApprovedXaf,
    });
    // A decline is stored as "answered, with nothing approved".
    const overCapDeclined = o.overCapApprovedAt != null && o.overCapApprovedXaf == null && money.needsCustomerApproval;
    const overCapWaiting = o.overCapApprovedAt == null && money.needsCustomerApproval;
    const goodsNotRecorded =
      money.shopping && o.goodsActualXaf == null && GOODS_DUE_STATUSES.includes(o.orderStatus);
    // Two readings of one receipt disagreeing. Not an accusation — far more
    // often a missing zero — but it is the only signal that the amount a
    // customer is about to be charged may be wrong.
    const receipt = checkReceipt(o.goodsActualXaf, o.goodsReceiptReadXaf);

    let kind: string;
    // Money already spent and refused outranks everything: nobody else can move it.
    if (overCapDeclined) kind = "OVER_CAP_DECLINED";
    else if (overCapWaiting) kind = "OVER_CAP_WAITING";
    else if (receipt.needsLook) kind = "RECEIPT_MISMATCH";
    else if (goodsNotRecorded) kind = "GOODS_NOT_RECORDED";
    else if (o.quoteSentAt && !o.customerNotifiedAt) kind = "CUSTOMER_NOT_TOLD";
    else if (o.paymentStatus === "SUBMITTED_UNVERIFIED") kind = "PAYMENT_UNVERIFIED";
    else if (o.assignedRiderId && !o.riderAcceptedAt) kind = "RIDER_SILENT";
    else if (o.orderStatus === "PAYMENT_VERIFIED" && !o.assignedRiderId) kind = "NO_RIDER";
    else if (o.quoteSentAt && !o.quoteAcceptedAt && !o.quoteDeclinedAt) kind = "QUOTE_UNANSWERED";
    else if (
      OUT_ON_THE_ROAD.includes(o.orderStatus) &&
      o.riderAcceptedAt &&
      (!o.riderLocationAt || o.riderLocationAt < trackingCutoff)
    )
      kind = "TRACKING_LOST";
    else kind = "UNREVIEWED";

    // Time the clock from the moment the problem started, not from the order.
    // An overspend has been outstanding since the money left the rider's hand.
    const since =
      kind === "RIDER_SILENT" && o.assignedAt
        ? o.assignedAt
        : (kind === "OVER_CAP_DECLINED" || kind === "OVER_CAP_WAITING") && o.goodsRecordedAt
          ? o.goodsRecordedAt
          : o.createdAt;
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
