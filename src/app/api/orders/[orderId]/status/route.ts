import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { isTransitionAllowed } from "@/lib/orders/statusMachine";
import type { OrderStatus } from "@prisma/client";

/**
 * POST /api/orders/[orderId]/status — validated status transition.
 * Writes one OrderStatusHistory row per transition inside a transaction.
 * Riders may only move their own assigned orders; DELIVERED requires proof.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nextStatus = body.status as OrderStatus;
  const note = typeof body.note === "string" ? body.note : null;
  const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason : null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { deliveryProofs: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Riders can only touch their own assigned orders.
  if (user.role === "RIDER" && order.assignedRiderId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isTransitionAllowed(order.orderStatus, nextStatus, user.role)) {
    return NextResponse.json(
      { error: `Transition ${order.orderStatus} → ${nextStatus} not allowed for ${user.role}` },
      { status: 409 }
    );
  }

  // Delivery requires at least one delivery-stage proof (OTP or photo).
  if (nextStatus === "DELIVERED") {
    const hasProof = order.deliveryProofs.some(
      (p) => p.stage === "DELIVERY" && (p.otpEntered || p.photoUrl)
    );
    if (!hasProof) {
      return NextResponse.json({ error: "Delivery proof required" }, { status: 400 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = { orderStatus: nextStatus };
    if (nextStatus === "DELIVERED") data.completedAt = new Date();
    if (nextStatus === "REJECTED" && rejectionReason) data.rejectionReason = rejectionReason;

    const result = await tx.order.update({ where: { id: orderId }, data });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.orderStatus,
        toStatus: nextStatus,
        changedByUserId: user.id,
        changedByRole: user.role,
        note: rejectionReason ? `${rejectionReason}${note ? ` — ${note}` : ""}` : note,
      },
    });
    return result;
  });

  return NextResponse.json({ orderStatus: updated.orderStatus });
}
