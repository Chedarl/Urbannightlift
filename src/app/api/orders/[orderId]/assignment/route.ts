import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notifyRiderAnswered } from "@/lib/notify/triggers";

/**
 * POST /api/orders/[orderId]/assignment — the assigned rider accepts or
 * declines the job.
 *
 * Assignment used to write a rider id and stop there, so dispatch had no way
 * of knowing whether the rider had even opened the app. At 1 AM that gap is an
 * order sitting still while everyone assumes someone else has it. Now an
 * assignment is an offer with an answer and a timestamp, and an unanswered one
 * shows up on the dispatch board.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const accept = body.accept === true;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      paymentMethod: true,
      assignedRiderId: true,
      riderAcceptedAt: true,
      riderDeclinedAt: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.assignedRiderId !== user.id) {
    return NextResponse.json({ error: "This order is not assigned to you" }, { status: 403 });
  }
  if (order.riderAcceptedAt) {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  /*
   * Where a declined order goes back to.
   *
   * This used to be `PAYMENT_VERIFIED`, unconditionally. On a **cash** order
   * nothing is verified before the rider goes out — the money arrives at the
   * door — so declining one stamped the console with a verification that had
   * never happened, and wrote it into the status history as fact. The money
   * gate itself was never fooled (`dispatchBlocker` reads the payment row, not
   * this), but a dispatcher reading the board was.
   *
   * A cash order goes back to APPROVED, which is what it was: priced, agreed,
   * and waiting for a rider. Everything else returns to PAYMENT_VERIFIED, which
   * for those orders is true.
   */
  const returnTo = order.paymentMethod === "CASH" ? "APPROVED" : "PAYMENT_VERIFIED";

  // Declining hands the order back to dispatch rather than leaving it attached
  // to a rider who has said they cannot do it.
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: accept
        ? { riderAcceptedAt: now, riderDeclinedAt: null, riderDeclineReason: null }
        : {
            riderDeclinedAt: now,
            riderDeclineReason: reason || null,
            assignedRiderId: null,
            orderStatus: returnTo,
          },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        // The status it was actually in, not an assumption about it. A trail
        // that reports a transition that did not happen is worse than none.
        fromStatus: order.orderStatus,
        toStatus: accept ? order.orderStatus : returnTo,
        changedByUserId: user.id,
        changedByRole: "RIDER",
        note: accept
          ? "Rider accepted the assignment"
          : `Rider declined the assignment${reason ? ` — ${reason}` : ""}`,
      },
    });
  });

  await recordAudit({
    actor: user,
    action: accept ? "order.assignment_accepted" : "order.assignment_declined",
    entityType: "order",
    entityId: orderId,
    entityLabel: order.orderCode,
    reason: reason || null,
  });

  await notifyRiderAnswered(order.orderCode, orderId, user.fullName, accept, reason);

  return NextResponse.json({ ok: true, accepted: accept });
}
