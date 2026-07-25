import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * Archiving and deleting orders.
 *
 * POST   — archive or un-archive. An archived order leaves every operational
 *          view, count and export, and stays recoverable.
 * DELETE — a genuine, permanent removal. OWNER only, one order at a time, and
 *          it requires a typed reason.
 *
 * Why archive is the default and delete is not: in a business that handles
 * other people's money, the way you hide a stolen payment is to delete the
 * order it belonged to. Archiving gets the test data out of the way without
 * giving anyone that lever. The audit row outlives the order, so even a real
 * deletion leaves a record of who did it and why.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const archive = body.archive !== false;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderCode: true, archivedAt: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.order.update({
    where: { id: orderId },
    data: archive
      ? { archivedAt: new Date(), archivedByUserId: user.id, archiveReason: reason || null }
      : { archivedAt: null, archivedByUserId: null, archiveReason: null },
  });

  await recordAudit({
    actor: user,
    action: archive ? "order.archived" : "order.unarchived",
    entityType: "order",
    entityId: orderId,
    entityLabel: order.orderCode,
    reason: reason || null,
  });

  return NextResponse.json({ ok: true, archived: archive });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  // Deliberately narrower than ADMIN_ROLES: a dispatcher must not be able to
  // erase an order, because that is how evidence of a mishandled payment
  // disappears.
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can delete an order" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3) {
    return NextResponse.json({ error: "A reason is required to delete an order" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      paymentStatus: true,
      isTest: true,
      finalDeliveryFeeXaf: true,
      estimatedDeliveryFeeXaf: true,
      createdAt: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A verified payment means real money moved. Deleting that record would
  // destroy the only proof it happened, so it stays.
  if (order.paymentStatus === "VERIFIED" && !order.isTest) {
    return NextResponse.json(
      {
        error: "This order has a verified payment and cannot be deleted. Archive it instead.",
        code: "PAYMENT_VERIFIED",
      },
      { status: 409 }
    );
  }

  // Write the audit row first: if the delete then fails we have a harmless
  // extra log line, whereas the reverse order could delete without a record.
  await recordAudit({
    actor: user,
    action: "order.deleted",
    entityType: "order",
    entityId: orderId,
    entityLabel: order.orderCode,
    changes: {
      orderStatus: { from: order.orderStatus, to: null },
      paymentStatus: { from: order.paymentStatus, to: null },
      feeXaf: { from: order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf, to: null },
      createdAt: { from: order.createdAt, to: null },
    },
    reason,
  });

  // Children first — these rows reference the order.
  await prisma.$transaction([
    prisma.orderStatusHistory.deleteMany({ where: { orderId } }),
    prisma.deliveryProof.deleteMany({ where: { orderId } }),
    prisma.payment.deleteMany({ where: { orderId } }),
    prisma.incident.updateMany({ where: { orderId }, data: { orderId: null } }),
    prisma.order.delete({ where: { id: orderId } }),
  ]);

  return NextResponse.json({ ok: true, deleted: order.orderCode });
}
