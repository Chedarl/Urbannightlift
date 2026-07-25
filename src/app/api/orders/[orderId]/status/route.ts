import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { isTransitionAllowed } from "@/lib/orders/statusMachine";
import { splitEarnings } from "@/lib/orders/earnings";
import { getOperatingSettings } from "@/lib/settings";
import { notifyCustomerStatus } from "@/lib/notify/triggers";
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

  // The commission split is calculated once, at delivery, and stored on the
  // order. Looking it up later would mean a change to the rate silently
  // rewrites completed accounts.
  let earnings: ReturnType<typeof splitEarnings> | null = null;
  if (nextStatus === "DELIVERED" && order.riderPayoutXaf == null) {
    const settings = await getOperatingSettings();
    const fee = order.finalDeliveryFeeXaf ?? order.quotedFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0;
    earnings = splitEarnings(fee, settings.riderSharePercent);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = { orderStatus: nextStatus };
    if (nextStatus === "DELIVERED") {
      data.completedAt = new Date();
      if (earnings) {
        data.riderSharePercent = earnings.riderSharePercent;
        data.riderPayoutXaf = earnings.riderPayoutXaf;
        data.companyEarningXaf = earnings.companyEarningXaf;
        // On cash on delivery the rider has just taken the full fee at the
        // door; record it so the settlement figure is not guesswork.
        if (order.paymentMethod === "CASH" && order.cashCollectedXaf == null) {
          data.cashCollectedXaf = earnings.feeXaf;
        }
      }
    }
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

  // Keep the customer informed at the moments they care about, instead of
  // leaving them to guess and re-open the page.
  const CUSTOMER_FACING: Partial<Record<OrderStatus, string>> = {
    RIDER_ASSIGNED: "A rider has been assigned to your order.",
    RIDER_GOING_TO_PICKUP: "Your rider is on the way to pick up your order.",
    ITEM_COLLECTED: "Your order has been collected and is on its way.",
    RIDER_ARRIVED_AT_DELIVERY: "Your rider has arrived. Have your delivery code ready.",
    DELIVERED: "Delivered. Thank you for ordering with Urban Night Lift.",
    CANCELLED_BY_UNL: "Your order was cancelled. Our team will be in touch.",
  };
  const headline = CUSTOMER_FACING[nextStatus];
  if (headline) await notifyCustomerStatus(order.customerId, order.orderCode, headline);

  return NextResponse.json({ orderStatus: updated.orderStatus });
}
