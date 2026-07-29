import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notifyQuoteSent } from "@/lib/notify/triggers";
import { isTransitionAllowed } from "@/lib/orders/statusMachine";
import { guardStep } from "@/lib/orders/workflowGuard";

/**
 * POST /api/orders/[orderId]/quote — dispatch accepts an order at a price and
 * sends that price to the customer.
 *
 * Approving used to be a status change with no number attached to it, so the
 * customer was never told their order had been accepted, and never told what
 * it would cost. The fee could also be edited afterwards with the customer
 * none the wiser — they would find out at the door, refuse, and we would have
 * paid for the trip. A quote fixes the price and asks the customer to agree
 * to it before a rider is committed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const feeXaf = Number(body.feeXaf);
  if (!Number.isFinite(feeXaf) || feeXaf < 0) {
    return NextResponse.json({ error: "A delivery fee is required" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Re-quoting an order the customer already agreed to withdraws that
  // agreement — they have to accept the new number.
  const isRequote = order.quoteAcceptedAt != null;

  // Step two is finished once the customer accepts. Changing the price after
  // that is legitimate but it is a decision, not a button that happens to
  // still be on screen: the caller has to say so, and it is audited.
  const blocked = await guardStep(orderId, "QUOTE");
  if (blocked && !(isRequote && body.reopen === true)) {
    return NextResponse.json(
      {
        error: isRequote
          ? "The customer already accepted this price. Reopen the step to change it — they will have to accept again."
          : blocked,
        needsReopen: isRequote,
      },
      { status: 409 }
    );
  }
  const canApprove = order.orderStatus === "APPROVED" || isTransitionAllowed(order.orderStatus, "APPROVED", user.role);
  if (!canApprove) {
    return NextResponse.json(
      { error: `Cannot quote an order in status ${order.orderStatus}` },
      { status: 409 }
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: {
        orderStatus: "APPROVED",
        finalDeliveryFeeXaf: feeXaf,
        quotedFeeXaf: feeXaf,
        quoteSentAt: now,
        quoteAcceptedAt: null,
        quoteDeclinedAt: null,
        quoteDeclineReason: null,
        ...(note ? { customerVisibleNotes: note } : {}),
      },
    });
    // Keep the payment row's amount in step, otherwise the checkout screen
    // would quote the customer the original estimate.
    const payment = await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    if (payment) {
      await tx.payment.update({ where: { id: payment.id }, data: { amountXaf: feeXaf } });
    }
    if (order.orderStatus !== "APPROVED") {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.orderStatus,
          toStatus: "APPROVED",
          changedByUserId: user.id,
          changedByRole: user.role,
          note: `Quoted ${feeXaf} XAF`,
        },
      });
    }
    return result;
  });

  await recordAudit({
    actor: user,
    action: isRequote ? "order.requoted" : "order.quoted",
    entityType: "order",
    entityId: orderId,
    entityLabel: order.orderCode,
    changes: {
      finalDeliveryFeeXaf: { from: order.finalDeliveryFeeXaf, to: feeXaf },
      ...(isRequote ? { quoteAcceptedAt: { from: order.quoteAcceptedAt, to: null } } : {}),
    },
    reason: note || null,
  });

  await notifyQuoteSent(order.customerId, order.orderCode, feeXaf);

  return NextResponse.json({ ok: true, quotedFeeXaf: updated.quotedFeeXaf });
}
