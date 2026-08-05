import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { visibilityWhere } from "@/lib/orders/filters";
import { DashboardStats } from "@/components/admin/DashboardStats";
import {
  attentionWhere,
  classifyAttention,
  ATTENTION_SELECT,
} from "@/lib/orders/needsAttention";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES: OrderStatus[] = [
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
    // The needs-attention queue, from the shared module so the staff assistant
    // and this panel can never disagree about what is wrong tonight.
    prisma.order.findMany({
      where: attentionWhere(visible, now),
      orderBy: { createdAt: "asc" },
      take: 50,
      select: ATTENTION_SELECT,
    }),
  ]);

  const attentionRows = attention.map((o) => classifyAttention(o, now));

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
