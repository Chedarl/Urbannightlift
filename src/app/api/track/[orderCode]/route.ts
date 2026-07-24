import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";

/**
 * GET /api/track/[orderCode] — public live tracking snapshot for the customer
 * map: simplified status + pickup/delivery/rider coordinates. Order codes are
 * unguessable; coordinates are not sensitive credentials.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      orderStatus: true,
      pickupLat: true,
      pickupLng: true,
      deliveryLat: true,
      deliveryLng: true,
      riderLat: true,
      riderLng: true,
      riderLocationAt: true,
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  return NextResponse.json({
    found: true,
    statusKey: CUSTOMER_STATUS_KEY[order.orderStatus],
    pickup: order.pickupLat != null && order.pickupLng != null ? { lat: order.pickupLat, lng: order.pickupLng } : null,
    delivery: order.deliveryLat != null && order.deliveryLng != null ? { lat: order.deliveryLat, lng: order.deliveryLng } : null,
    rider: order.riderLat != null && order.riderLng != null ? { lat: order.riderLat, lng: order.riderLng, at: order.riderLocationAt } : null,
  });
}
