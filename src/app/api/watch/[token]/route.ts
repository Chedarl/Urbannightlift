import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readWatchToken, watchWindowOpen } from "@/lib/orders/watchLink";
import { distanceKm } from "@/lib/orders/pricing";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";

export const dynamic = "force-dynamic";

/**
 * Average night speed for a motorbike in Yaoundé — well below a daytime figure,
 * because the roads are empty after midnight but the surfaces are not. An ETA
 * that keeps passing without the rider arriving is worse than no ETA.
 */
const NIGHT_SPEED_KMH = 18;
const HANDOVER_MINUTES = 4;

/**
 * A destination rounded to roughly a hundred metres.
 *
 * The watcher needs to see the rider converging on somewhere to know the
 * journey is nearly over. They do not need the door. A watch link is built to
 * be forwarded — that is its whole purpose — so it must not publish where
 * somebody lives to whoever the group chat ends up containing.
 */
function approximate(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/**
 * GET /api/watch/[token] — what somebody trusted is allowed to see.
 *
 * Deliberately narrow: where the rider is, roughly where they are heading, how
 * long it should take, and the rider's first name. No delivery code, no phone
 * number, no street address, no customer name, no prices. Nothing here is worth
 * stealing, which is the only reason it is safe to paste into a group chat.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = readWatchToken(token);
  if (!claim) return NextResponse.json({ ok: false, reason: "expired" }, { status: 404 });

  const order = await prisma.order.findUnique({
    where: { orderCode: claim.code },
    select: {
      orderStatus: true,
      completedAt: true,
      customerConfirmedAt: true,
      riderLat: true,
      riderLng: true,
      riderLocationAt: true,
      deliveryLat: true,
      deliveryLng: true,
      assignedRider: { select: { fullName: true, vehicleRef: true } },
    },
  });
  if (!order) return NextResponse.json({ ok: false, reason: "expired" }, { status: 404 });

  if (!watchWindowOpen(order)) {
    // Finished, or stopped. The watcher is told it is over — silence would just
    // look broken, and "they are home" is the one thing they were waiting for.
    return NextResponse.json({
      ok: true,
      over: true,
      arrived: order.customerConfirmedAt != null || order.completedAt != null,
    });
  }

  const destination =
    order.deliveryLat != null && order.deliveryLng != null
      ? approximate(order.deliveryLat, order.deliveryLng)
      : null;

  let etaMinutes: number | null = null;
  if (order.riderLat != null && order.riderLng != null && order.deliveryLat != null && order.deliveryLng != null) {
    const km = distanceKm(order.riderLat, order.riderLng, order.deliveryLat, order.deliveryLng);
    etaMinutes = Math.max(1, Math.round((km / NIGHT_SPEED_KMH) * 60) + HANDOVER_MINUTES);
  }

  return NextResponse.json({
    ok: true,
    over: false,
    arrived: false,
    statusKey: CUSTOMER_STATUS_KEY[order.orderStatus],
    // First name only. A watcher needs to know somebody is coming, not who.
    riderFirstName: order.assignedRider?.fullName?.split(/\s+/)[0] ?? null,
    vehicleRef: order.assignedRider?.vehicleRef ?? null,
    rider:
      order.riderLat != null && order.riderLng != null
        ? { lat: order.riderLat, lng: order.riderLng, at: order.riderLocationAt }
        : null,
    destination,
    etaMinutes,
    expiresAt: new Date(claim.exp).toISOString(),
  });
}
