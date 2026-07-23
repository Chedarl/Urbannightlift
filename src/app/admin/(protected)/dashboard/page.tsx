import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { DashboardStats } from "@/components/admin/DashboardStats";

export const dynamic = "force-dynamic";

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

  const [tonightOrders, rider] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start, lt: end } },
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
  ]);

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
  };

  return <DashboardStats stats={stats} mode={settings.mode} />;
}
