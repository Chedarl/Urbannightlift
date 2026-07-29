import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/auth/customer";

/**
 * GET /api/account/me — everything the order forms need to stop treating a
 * regular customer like a stranger.
 *
 * Name and phone prefill the form, saved addresses become one-tap chips, the
 * order count powers the "your 6th night with us" line, and the last order is
 * enough to rebuild a draft for a one-tap reorder without a second round trip.
 *
 * Returns `{ customer: null }` with a 200 for guests — this is called on every
 * order form, and a 401 there would look like a failure when it is the normal
 * case.
 */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null }, { status: 200 });

  const [addresses, lastOrder] = await Promise.all([
    prisma.customerAddress.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      select: {
        orderCode: true,
        serviceType: true,
        itemDescription: true,
        serviceDetails: true,
        quantity: true,
        declaredValueXaf: true,
        pickupLocation: true,
        pickupLandmark: true,
        deliveryLocation: true,
        deliveryLandmark: true,
        paymentMethod: true,
        estimatedDeliveryFeeXaf: true,
        finalDeliveryFeeXaf: true,
        isMedicine: true,
      },
    }),
  ]);

  return NextResponse.json({
    customer: {
      fullName: customer.fullName,
      whatsappNumber: customer.whatsappNumber,
      preferredLanguage: customer.preferredLanguage,
      totalOrders: customer.totalOrders,
      addresses: addresses.map((a) => ({
        id: a.id,
        label: a.label,
        locationText: a.locationText,
        landmark: a.landmark,
        lat: a.lat,
        lng: a.lng,
        zoneId: a.zoneId,
      })),
      // What it actually cost last time, preferring the settled figure over
      // the estimate — a reorder should not quote a price we already revised.
      lastOrder: lastOrder
        ? {
            ...lastOrder,
            feeXaf: lastOrder.finalDeliveryFeeXaf ?? lastOrder.estimatedDeliveryFeeXaf ?? null,
          }
        : null,
    },
  });
}
