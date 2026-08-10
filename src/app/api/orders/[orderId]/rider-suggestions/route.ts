import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { suggestRiders, type RiderCandidate } from "@/lib/riders/suggest";
import { isOutWithRider } from "@/lib/orders/liveWatch";
import { isShoppingService } from "@/lib/orders/goodsMoney";
import { canCoverPurchase, type RiderFloatEntryType } from "@/lib/riders/float";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/[orderId]/rider-suggestions — who should take this job.
 *
 * Dispatch only, and for the same reason `/api/admin/live` is: this returns
 * every rider's last known position in one response. A rider session reading it
 * would get the whole fleet's whereabouts.
 *
 * It proposes and never acts. The ranking is `suggestRiders`, which is pure and
 * proved offline; everything here is the work of turning the database into its
 * input — and the one thing this layer knows that the ranking cannot: whether a
 * given rider is actually *allowed* to take this particular order.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      serviceType: true,
      pickupLat: true,
      pickupLng: true,
      goodsCapXaf: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const riders = await prisma.user.findMany({
    where: { role: "RIDER", status: "ACTIVE" },
    select: { id: true, fullName: true, isOnline: true, floatLimitXaf: true, floatSuspended: true },
  });
  if (riders.length === 0) return NextResponse.json({ suggestions: [], blocked: [] });

  const riderIds = riders.map((r) => r.id);

  /*
   * Everything each rider is carrying, in one query rather than one per rider.
   *
   * Used twice over: the most recent position becomes their location, and the
   * count of live ones becomes their load. A rider's whereabouts is not stored
   * on their user row — it only exists on the order they were last sharing from
   * — so this is the only place it can come from.
   */
  const live = await prisma.order.findMany({
    where: { assignedRiderId: { in: riderIds }, id: { not: orderId } },
    orderBy: { riderLocationAt: "desc" },
    select: {
      assignedRiderId: true,
      orderStatus: true,
      riderLat: true,
      riderLng: true,
      riderLocationAt: true,
    },
  });

  const ledgers = isShoppingService(order.serviceType)
    ? await prisma.riderFloatLedger.findMany({
        where: { riderId: { in: riderIds } },
        select: { riderId: true, amountXaf: true, type: true },
      })
    : [];

  const blocked: { fullName: string; reason: string }[] = [];

  const candidates: RiderCandidate[] = riders.map((r) => {
    const theirs = live.filter((o) => o.assignedRiderId === r.id);
    const fix = theirs.find((o) => o.riderLat != null && o.riderLng != null && o.riderLocationAt != null);
    const activeOrders = theirs.filter((o) => isOutWithRider(o.orderStatus)).length;

    /*
     * The one check the pure ranking cannot make: on a shopping order the rider
     * has to be able to pay the shop. Offering somebody a job they will have to
     * hand back at the counter wastes the order and embarrasses them.
     */
    let blockedReason: string | null = null;
    if (isShoppingService(order.serviceType) && order.goodsCapXaf) {
      const mine = ledgers.filter((l) => l.riderId === r.id);
      const canCover = canCoverPurchase(
        { limitXaf: r.floatLimitXaf, suspended: r.floatSuspended },
        mine.map((l) => ({ amountXaf: l.amountXaf, type: l.type as RiderFloatEntryType })),
        order.goodsCapXaf,
        0
      );
      if (!canCover) blockedReason = "No float to cover the shopping";
    }
    if (blockedReason) blocked.push({ fullName: r.fullName, reason: blockedReason });

    return {
      id: r.id,
      fullName: r.fullName,
      isOnline: r.isOnline,
      lat: fix?.riderLat ?? null,
      lng: fix?.riderLng ?? null,
      fixAt: fix?.riderLocationAt ?? null,
      activeOrders,
      blockedReason,
    };
  });

  const pickup =
    order.pickupLat != null && order.pickupLng != null
      ? { lat: order.pickupLat, lng: order.pickupLng }
      : null;

  const suggestions = suggestRiders({ pickup, candidates }).map((s) => ({
    riderId: s.rider.id,
    fullName: s.rider.fullName,
    isOnline: s.rider.isOnline,
    activeOrders: s.rider.activeOrders,
    km: s.km,
    reasons: s.reasons,
    reasonsFr: s.reasonsFr,
  }));

  // `pinned` tells the screen whether the distances mean anything, so it can say
  // "no pickup pin" rather than silently ranking on load alone.
  return NextResponse.json({ suggestions, blocked, pinned: pickup != null });
}
