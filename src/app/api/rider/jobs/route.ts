import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { splitEarnings } from "@/lib/orders/earnings";
import { isShoppingService } from "@/lib/orders/goodsMoney";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/jobs — tonight's work, as JSON.
 *
 * The same rows the web dashboard renders, scoped to the signed-in rider by
 * `assignedRiderId` and never by anything the client sends. A rider app asking
 * for "jobs" can only ever be asking for its own.
 *
 * Customer contact details are deliberately **not** here. The list is a list;
 * the phone number appears when they open the job they are actually doing, so a
 * synced-and-cached list on a lost phone is not a directory of customers.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getOperatingSettings();
  const { start, end } = tonightWindow(settings.operatingStartHour);

  const orders = await prisma.order.findMany({
    where: {
      assignedRiderId: user.id,
      createdAt: { gte: start, lt: end },
      archivedAt: null,
      ...(settings.testMode ? {} : { isTest: false }),
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      serviceType: true,
      paymentMethod: true,
      pickupLocation: true,
      deliveryLocation: true,
      pickupLat: true,
      pickupLng: true,
      deliveryLat: true,
      deliveryLng: true,
      assignedAt: true,
      riderAcceptedAt: true,
      riderPayoutXaf: true,
      finalDeliveryFeeXaf: true,
      quotedFeeXaf: true,
      estimatedDeliveryFeeXaf: true,
      customer: { select: { fullName: true } },
      pickupZone: { select: { zoneName: true } },
      deliveryZone: { select: { zoneName: true } },
    },
  });

  return NextResponse.json({
    jobs: orders.map((o) => {
      // Before delivery there is no frozen figure, so show what the job is
      // currently worth — nobody should accept work without knowing that.
      const fee = o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? o.estimatedDeliveryFeeXaf ?? 0;
      return {
        id: o.id,
        orderCode: o.orderCode,
        status: o.orderStatus,
        serviceType: o.serviceType,
        paymentMethod: o.paymentMethod,
        customerName: o.customer.fullName,
        pickup: {
          text: o.pickupLocation,
          zone: o.pickupZone?.zoneName ?? null,
          lat: o.pickupLat,
          lng: o.pickupLng,
        },
        delivery: {
          text: o.deliveryLocation,
          zone: o.deliveryZone?.zoneName ?? null,
          lat: o.deliveryLat,
          lng: o.deliveryLng,
        },
        /** Null until they answer — the app shows Accept / Can't take it. */
        acceptedAt: o.riderAcceptedAt?.toISOString() ?? null,
        offeredAt: o.assignedAt?.toISOString() ?? null,
        payoutXaf:
          o.riderPayoutXaf ??
          (fee > 0 ? splitEarnings(fee, settings.riderSharePercent).riderPayoutXaf : null),
        payoutIsEstimate: o.riderPayoutXaf == null,
        /** Drives whether the app offers the record-a-receipt step. */
        isShopping: isShoppingService(o.serviceType),
      };
    }),
  });
}
