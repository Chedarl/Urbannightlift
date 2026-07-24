import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/**
 * POST /api/orders/[orderId]/location — the assigned rider shares their live
 * GPS position. Stored as the order's last-known rider location for the
 * customer's live tracking map.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { assignedRiderId: true } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.assignedRiderId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { riderLat: lat, riderLng: lng, riderLocationAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
