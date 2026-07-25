import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { riderBalanceForOrder } from "@/lib/orders/earnings";

/**
 * POST /api/riders/[riderId]/settle — close out the cash a rider is holding.
 *
 * On cash on delivery the rider collects the whole fee at the door and is
 * therefore holding our share until they hand it over. This records the
 * hand-over: which deliveries were covered, how much was expected, and how
 * much actually arrived.
 *
 * The variance is stored rather than hidden. A settlement that is short is a
 * fact worth keeping — a shortfall that quietly disappears is how a cash
 * business stops being a business.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const receivedXaf = body.receivedXaf != null ? Number(body.receivedXaf) : null;

  const rider = await prisma.user.findFirst({
    where: { id: riderId, role: "RIDER" },
    select: { id: true, fullName: true },
  });
  if (!rider) return NextResponse.json({ error: "Rider not found" }, { status: 404 });

  const outstanding = await prisma.order.findMany({
    where: {
      assignedRiderId: riderId,
      orderStatus: { in: ["DELIVERED", "CLOSED"] },
      cashSettledAt: null,
      riderPayoutXaf: { not: null },
      isTest: false,
      archivedAt: null,
    },
    select: {
      id: true,
      orderCode: true,
      paymentMethod: true,
      riderPayoutXaf: true,
      companyEarningXaf: true,
      cashCollectedXaf: true,
    },
  });

  if (outstanding.length === 0) {
    return NextResponse.json({ ok: true, settled: 0, expectedXaf: 0 });
  }

  const expectedXaf = outstanding.reduce(
    (sum, o) =>
      sum +
      riderBalanceForOrder({
        paymentMethod: o.paymentMethod,
        riderPayoutXaf: o.riderPayoutXaf,
        companyEarningXaf: o.companyEarningXaf,
        cashCollectedXaf: o.cashCollectedXaf,
      }),
    0
  );

  const now = new Date();
  await prisma.order.updateMany({
    where: { id: { in: outstanding.map((o) => o.id) } },
    data: { cashSettledAt: now, cashSettledByUserId: user.id },
  });

  const variance = receivedXaf != null ? Math.round(receivedXaf - expectedXaf) : 0;

  await recordAudit({
    actor: user,
    action: "rider.cash_settled",
    entityType: "user",
    entityId: riderId,
    entityLabel: rider.fullName,
    changes: {
      deliveries: { from: null, to: outstanding.length },
      expectedXaf: { from: null, to: expectedXaf },
      ...(receivedXaf != null ? { receivedXaf: { from: null, to: Math.round(receivedXaf) } } : {}),
      ...(variance !== 0 ? { varianceXaf: { from: null, to: variance } } : {}),
      orderCodes: { from: null, to: outstanding.map((o) => o.orderCode) },
    },
    reason: note || null,
  });

  return NextResponse.json({
    ok: true,
    settled: outstanding.length,
    expectedXaf,
    variance,
  });
}
