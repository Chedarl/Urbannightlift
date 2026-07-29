import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { byConcern, concernOf, isLive, isOutWithRider, trackingState, fixAgeMinutes } from "@/lib/orders/liveWatch";
import { stageOf } from "@/lib/orders/dispatchRules";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/live — everything happening right now, on one screen.
 *
 * Dispatch only. This returns customers' phone numbers, riders' phone numbers
 * and live positions all together, which is exactly what makes it useful and
 * exactly why a rider session must not be able to read it: a rider would get
 * every other rider's location and every customer's number in one request.
 *
 * Recomputed on each poll rather than stored. Nothing here is a fact worth
 * keeping — it is a reading of the moment, and a stale "everything is fine"
 * cached from six minutes ago is worse than no screen at all.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  // Two nights of orders is far more than a shift and still a small query.
  const since = new Date(now.getTime() - 48 * 3600_000);

  const rows = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      serviceType: true,
      isTest: true,
      createdAt: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quoteDeclinedAt: true,
      quotedFeeXaf: true,
      finalDeliveryFeeXaf: true,
      estimatedDeliveryFeeXaf: true,
      paymentStatus: true,
      paymentMethod: true,
      assignedRiderId: true,
      assignedAt: true,
      riderAcceptedAt: true,
      riderLat: true,
      riderLng: true,
      riderLocationAt: true,
      customerConfirmedAt: true,
      pickupLocation: true,
      deliveryLocation: true,
      deliveryLat: true,
      deliveryLng: true,
      customer: { select: { fullName: true, whatsappNumber: true } },
      assignedRider: { select: { id: true, fullName: true, phone: true, vehicleRef: true, isOnline: true, lastSeenAt: true } },
    },
  });

  const live = rows
    .filter((o) => isLive({ orderStatus: o.orderStatus, customerConfirmedAt: o.customerConfirmedAt }))
    .map((o) => {
      const concern = concernOf(
        {
          orderStatus: o.orderStatus,
          createdAt: o.createdAt,
          quoteSentAt: o.quoteSentAt,
          quoteAcceptedAt: o.quoteAcceptedAt,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          assignedRiderId: o.assignedRiderId,
          riderAcceptedAt: o.riderAcceptedAt,
          assignedAt: o.assignedAt,
          riderLocationAt: o.riderLocationAt,
          riderLat: o.riderLat,
          riderLng: o.riderLng,
          customerConfirmedAt: o.customerConfirmedAt,
        },
        now
      );
      return {
        id: o.id,
        orderCode: o.orderCode,
        orderStatus: o.orderStatus,
        serviceType: o.serviceType,
        isTest: o.isTest,
        createdAt: o.createdAt,
        stage: stageOf({
          orderStatus: o.orderStatus,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          quoteSentAt: o.quoteSentAt,
          quoteAcceptedAt: o.quoteAcceptedAt,
          quoteDeclinedAt: o.quoteDeclinedAt,
          assignedRiderId: o.assignedRiderId,
          customerConfirmedAt: o.customerConfirmedAt,
        }),
        concern,
        onTheRoad: isOutWithRider(o.orderStatus) && o.assignedRiderId != null,
        tracking: trackingState(o.riderLocationAt, now),
        fixAgeMinutes: fixAgeMinutes(o.riderLocationAt, now),
        riderLat: o.riderLat,
        riderLng: o.riderLng,
        deliveryLat: o.deliveryLat,
        deliveryLng: o.deliveryLng,
        pickupLocation: o.pickupLocation,
        deliveryLocation: o.deliveryLocation,
        feeXaf: o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? o.estimatedDeliveryFeeXaf,
        customerName: o.customer.fullName,
        customerPhone: o.customer.whatsappNumber,
        rider: o.assignedRider
          ? {
              id: o.assignedRider.id,
              name: o.assignedRider.fullName,
              phone: o.assignedRider.phone,
              vehicleRef: o.assignedRider.vehicleRef,
              isOnline: o.assignedRider.isOnline,
            }
          : null,
      };
    })
    .sort(byConcern);

  // Who is available, so dispatch can see the bench without leaving the screen.
  const riders = await prisma.user.findMany({
    where: { role: "RIDER", status: "ACTIVE" },
    orderBy: [{ isOnline: "desc" }, { fullName: "asc" }],
    select: { id: true, fullName: true, phone: true, vehicleRef: true, isOnline: true, lastSeenAt: true },
  });

  const loadByRider = new Map<string, number>();
  for (const o of live) {
    if (o.rider) loadByRider.set(o.rider.id, (loadByRider.get(o.rider.id) ?? 0) + 1);
  }

  return NextResponse.json({
    now: now.toISOString(),
    orders: live,
    riders: riders.map((r) => ({
      id: r.id,
      name: r.fullName,
      phone: r.phone,
      vehicleRef: r.vehicleRef,
      isOnline: r.isOnline,
      lastSeenAt: r.lastSeenAt,
      activeOrders: loadByRider.get(r.id) ?? 0,
    })),
    counts: {
      urgent: live.filter((o) => o.concern.level === "URGENT").length,
      watch: live.filter((o) => o.concern.level === "WATCH").length,
      onTheRoad: live.filter((o) => o.onTheRoad).length,
      total: live.length,
    },
  });
}
