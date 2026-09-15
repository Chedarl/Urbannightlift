import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { recordAudit } from "@/lib/audit";
import { orderMoney } from "@/lib/orders/goodsMoney";

export const dynamic = "force-dynamic";

/**
 * POST /api/track/[orderCode]/goods-approval — the customer agrees to a shop
 * price above the cap they set, or refuses it.
 *
 * The cap is a promise: we said we would not spend more than that without
 * asking. This is the asking. Until it is answered the overage is not
 * collectable, which is the difference between a service that shops for you and
 * one that hands you a bill you never agreed to.
 *
 * Ownership is required on the same terms as accepting a quote — an order code
 * travels through screenshots, and nobody should be able to approve spending on
 * somebody else's behalf.
 *
 * Declining does not cancel the order. The goods are already bought; what it
 * does is refuse the overage and put the case in front of dispatch, who can
 * absorb it, re-price, or arrange a return. Silently charging it anyway is the
 * one outcome the design does not allow.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const approve = body.approve === true;

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      id: true,
      orderCode: true,
      serviceType: true,
      paymentMethod: true,
      estimatedDeliveryFeeXaf: true,
      finalDeliveryFeeXaf: true,
      goodsCapXaf: true,
      goodsActualXaf: true,
      overCapApprovedXaf: true,
      tipXaf: true,
      overCapApprovedAt: true,
      customer: { select: { whatsappNumber: true } },
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  const claimedPhone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const owns =
    (await hasOrderAccess(orderCode)) ||
    (claimedPhone.length > 0 && normalizePhone(order.customer.whatsappNumber) === claimedPhone);
  if (!owns) return NextResponse.json({ error: "Verification required" }, { status: 403 });

  if (order.goodsActualXaf == null) {
    return NextResponse.json({ error: "Nothing has been bought yet" }, { status: 409 });
  }
  if (order.overCapApprovedAt) {
    return NextResponse.json({ ok: true, alreadyAnswered: true });
  }

  const feeXaf = order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0;
  const before = orderMoney({
    serviceType: order.serviceType,
    deliveryFeeXaf: feeXaf,
    goodsCapXaf: order.goodsCapXaf,
    goodsActualXaf: order.goodsActualXaf,
    overCapApprovedXaf: null,
    tipXaf: order.tipXaf,
  });
  if (!before.needsCustomerApproval) {
    return NextResponse.json({ ok: true, nothingToApprove: true });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        // Record the figure they agreed to, not just that they agreed — the cap
        // they originally set stays untouched as the record of the promise.
        overCapApprovedXaf: approve ? order.goodsActualXaf : null,
        overCapApprovedAt: now,
      },
    });

    if (approve && order.paymentMethod === "CASH") {
      const after = orderMoney({
        serviceType: order.serviceType,
        deliveryFeeXaf: feeXaf,
        goodsCapXaf: order.goodsCapXaf,
        goodsActualXaf: order.goodsActualXaf,
        overCapApprovedXaf: order.goodsActualXaf,
        tipXaf: order.tipXaf,
      });
      await tx.payment.updateMany({
        where: { orderId: order.id, status: { in: ["PENDING", "SUBMITTED_UNVERIFIED"] } },
        data: { amountXaf: after.totalXaf },
      });
    }

    // No status-history row: the order's status has not moved. The decision is
    // recorded in the audit log below, which is where money decisions belong.
  });

  await recordAudit({
    entityType: "order",
    entityId: order.id,
    entityLabel: order.orderCode,
    action: approve ? "OVER_CAP_APPROVED" : "OVER_CAP_DECLINED",
    actor: null,
    reason: `${order.goodsActualXaf} XAF against a ${order.goodsCapXaf ?? 0} cap`,
  });

  return NextResponse.json({ ok: true, approved: approve });
}
