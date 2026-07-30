import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { RiderDashboard } from "@/components/rider/RiderDashboard";
import { riderStanding } from "@/lib/riders/standing";

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
      where: {
        assignedRiderId: rider.id,
        createdAt: { gte: start, lt: end },
        archivedAt: null,
        // A rider rehearsing before launch still has to see the job.
        ...(settings.testMode ? {} : { isTest: false }),
      },
      orderBy: { updatedAt: "asc" },
      include: {
        customer: { select: { fullName: true } },
        pickupZone: { select: { zoneName: true } },
        deliveryZone: { select: { zoneName: true } },
      },
    }),
    prisma.order.count({ where: { assignedRiderId: rider.id, orderStatus: { in: ["DELIVERED", "CLOSED"] } } }),
  ]);

  /**
   * The rider's own record: what they have earned across every finished night,
   * how customers rate them, and one honest line about how it is going. Until
   * now the app told a rider almost nothing about their own work — which is a
   * strange thing to withhold from the person the whole business depends on.
   */
  const historyRows = await prisma.order.findMany({
    where: { assignedRiderId: rider.id },
    select: { orderStatus: true, riderPayoutXaf: true, ratingStars: true, isTest: true },
  });
  const standing = riderStanding(
    historyRows.map((o) => ({
      completed: o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED",
      riderPayoutXaf: o.riderPayoutXaf,
      ratingStars: o.ratingStars,
      isTest: o.isTest,
    }))
  );

  const rows = tonightOrders.map((o) => ({
    id: o.id,
    orderCode: o.orderCode,
    customerName: o.customer.fullName,
    serviceType: o.serviceType,
    pickupZone: o.pickupZone?.zoneName ?? "—",
    deliveryZone: o.deliveryZone?.zoneName ?? "—",
    orderStatus: o.orderStatus,
  }));

  // What the rider has actually earned tonight, from the frozen split.
  const earnedTonightXaf = tonightOrders.reduce((sum, o) => sum + (o.riderPayoutXaf ?? 0), 0);

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
      isOnline={rider.isOnline}
      earnedTonightXaf={earnedTonightXaf}
      standing={standing}
    />
  );
}
