import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { RiderDashboard } from "@/components/rider/RiderDashboard";

export const dynamic = "force-dynamic";

const ACTIVE = [
  "RIDER_ASSIGNED",
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
] as const;

export default async function RiderDashboardPage() {
  const rider = await requireRole(["RIDER"]);
  if (!rider) return null;

  const settings = await getOperatingSettings();
  const { start, end } = tonightWindow(settings.operatingStartHour);

  const [tonightOrders, totalDeliveries] = await Promise.all([
    prisma.order.findMany({
      where: { assignedRiderId: rider.id, createdAt: { gte: start, lt: end } },
      orderBy: { updatedAt: "asc" },
      include: {
        customer: { select: { fullName: true } },
        pickupZone: { select: { zoneName: true } },
        deliveryZone: { select: { zoneName: true } },
      },
    }),
    prisma.order.count({ where: { assignedRiderId: rider.id, orderStatus: { in: ["DELIVERED", "CLOSED"] } } }),
  ]);

  const rows = tonightOrders.map((o) => ({
    id: o.id,
    orderCode: o.orderCode,
    customerName: o.customer.fullName,
    serviceType: o.serviceType,
    pickupZone: o.pickupZone?.zoneName ?? "—",
    deliveryZone: o.deliveryZone?.zoneName ?? "—",
    orderStatus: o.orderStatus,
  }));

  const completedTonight = rows.filter((r) => ["DELIVERED", "CLOSED"].includes(r.orderStatus)).length;
  const activeOrder = rows.find((r) => (ACTIVE as readonly string[]).includes(r.orderStatus) && r.orderStatus !== "RIDER_ASSIGNED");
  const nextPickup = rows.find((r) => r.orderStatus === "RIDER_ASSIGNED");

  return (
    <RiderDashboard
      rows={rows}
      stats={{
        assigned: rows.length,
        completedTonight,
        totalDeliveries,
        activeOrderId: activeOrder?.id ?? null,
        nextPickupId: nextPickup?.id ?? null,
      }}
    />
  );
}
