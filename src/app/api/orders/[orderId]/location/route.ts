import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/**
 * POST /api/orders/[orderId]/location — the assigned rider shares their live
 * GPS position. Stored as the order's last-known rider location for the
 * customer's live tracking map.
 *
 * Accepts one position or a batch of them. The batch form exists for the native
 * app: background tracking keeps recording through a dead-signal patch and
 * flushes what it queued when signal returns, and sending forty separate
 * requests over a connection that has just come back is how you lose them
 * again. Only the newest position is stored — the map wants where the rider is,
 * not where they have been — but taking the batch means the app can clear its
 * queue on one round trip.
 *
 * The single-position form is unchanged, so the web tracker keeps working.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { assignedRiderId: true } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.assignedRiderId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  interface Fix {
    lat: number;
    lng: number;
    at: number;
  }
  const fixes: Fix[] = [];

  const push = (lat: unknown, lng: unknown, at: unknown) => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    // Outside these a value is a sensor error or a placeholder, and writing it
    // would put the rider in the sea on the customer's map.
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return;
    const t = Number(at);
    fixes.push({ lat: la, lng: ln, at: Number.isFinite(t) && t > 0 ? t : Date.now() });
  };

  if (Array.isArray(body.positions)) {
    for (const p of body.positions.slice(0, 200)) {
      if (p && typeof p === "object") push(p.lat, p.lng, p.at);
    }
  } else {
    push(body.lat, body.lng, body.at);
  }

  if (fixes.length === 0) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  // Newest wins, whatever order the queue arrived in.
  const latest = fixes.reduce((a, b) => (b.at > a.at ? b : a));

  await prisma.order.update({
    where: { id: orderId },
    data: {
      riderLat: latest.lat,
      riderLng: latest.lng,
      // Stamped with when the fix was taken, not when it arrived. A queued
      // position that reaches us ten minutes late must not make a stale map look
      // live — the tracking screen decides staleness from this.
      riderLocationAt: new Date(latest.at),
    },
  });

  return NextResponse.json({ ok: true, accepted: fixes.length });
}
