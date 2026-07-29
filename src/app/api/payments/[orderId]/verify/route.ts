import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { notifyCustomerStatus } from "@/lib/notify/triggers";
import { guardStep } from "@/lib/orders/workflowGuard";

/**
 * POST /api/payments/[orderId]/verify — manual payment verification.
 * The system NEVER auto-verifies from customer text. A verification note is
 * REQUIRED; the admin confirms after checking evidence out-of-band.
 * Also supports marking "submitted but unverified" and other payment states.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const status = body.status as string;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const validStatuses = [
    "PENDING",
    "AWAITING_CUSTOMER_PAYMENT",
    "SUBMITTED_UNVERIFIED",
    "VERIFIED",
    "FAILED",
    "REFUNDED",
    "CANCELLED",
  ];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verifying payment always requires a note documenting the evidence.
  if (status === "VERIFIED" && note.length < 3) {
    return NextResponse.json({ error: "Verification note required" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Money cannot be confirmed before the customer has agreed a price, and a
  // payment already verified is not verified a second time. The console hides
  // these controls once the step is finished; this is what makes the rule hold
  // for a stale tab or two dispatchers on the same order.
  if (status === "VERIFIED") {
    const blocked = await guardStep(orderId, "PAYMENT");
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  }

  // Verifying the money used to leave the order sitting in AWAITING_PAYMENT,
  // so the operational status said "waiting to be paid" about an order that had
  // been paid. The order has to move with the money, because dispatch is gated
  // on it.
  const advancesOrder =
    status === "VERIFIED" &&
    ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "APPROVED"].includes(order.orderStatus);
  const marksSubmitted =
    status === "SUBMITTED_UNVERIFIED" && order.orderStatus === "AWAITING_PAYMENT";

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: status as never,
        ...(advancesOrder ? { orderStatus: "PAYMENT_VERIFIED" as const } : {}),
        ...(marksSubmitted ? { orderStatus: "PAYMENT_SUBMITTED" as const } : {}),
      },
    });
    if (advancesOrder || marksSubmitted) {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.orderStatus,
          toStatus: advancesOrder ? "PAYMENT_VERIFIED" : "PAYMENT_SUBMITTED",
          changedByUserId: user.id,
          changedByRole: user.role,
          note: advancesOrder ? `Payment verified — ${note}` : "Payment reported by the customer",
        },
      });
    }
    const payment = await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    const paymentData = {
      status: status as never,
      verificationMethod: "MANUAL" as const,
      notes: note || null,
      ...(status === "VERIFIED" ? { verifiedById: user.id, verifiedAt: new Date() } : {}),
    };
    if (payment) {
      await tx.payment.update({ where: { id: payment.id }, data: paymentData });
    } else {
      await tx.payment.create({
        data: {
          orderId,
          customerId: order.customerId,
          paymentMethod: order.paymentMethod,
          amountXaf: order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0,
          ...paymentData,
        },
      });
    }
  });

  // Payment.verifiedById already attributes a verification; this puts the
  // change on the order's own activity trail alongside everything else.
  await recordAudit({
    actor: user,
    action: "payment.status_changed",
    entityType: "payment",
    entityId: orderId,
    entityLabel: order.orderCode,
    changes: { paymentStatus: { from: order.paymentStatus, to: status } },
    reason: note || null,
  });

  if (advancesOrder) {
    await notifyCustomerStatus(
      order.customerId,
      order.orderCode,
      "Payment confirmed — we're assigning your rider now."
    );
  }

  return NextResponse.json({ paymentStatus: status });
}
