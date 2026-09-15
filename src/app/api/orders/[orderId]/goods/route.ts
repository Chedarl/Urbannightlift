import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { orderMoney, isShoppingService } from "@/lib/orders/goodsMoney";
import { loadRiderFloat } from "@/lib/riders/floatAccount";
import { canCoverPurchase } from "@/lib/riders/float";
import { notifyCustomerStatus } from "@/lib/notify/triggers";
import { readReceipt } from "@/lib/ai/receipt";
import { groupXaf } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[orderId]/goods — the rider records what the shop charged.
 *
 * This is the moment the customer's money becomes a real number, so it is also
 * the moment the whole "are they taking from me?" question is settled. Three
 * things make that answerable rather than a matter of trust:
 *
 *  - **The receipt photo.** It is required. A number with no receipt behind it
 *    is exactly what somebody skimming would submit.
 *  - **We charge what is recorded, never a rounded-up version of it.** 4,850 is
 *    4,850. `orderMoney` does the arithmetic so no screen can quietly differ.
 *  - **It locks.** Once recorded, only an admin can change it, with a reason, in
 *    the audit trail. That protects the rider from an accusation as much as it
 *    protects the customer from a rider.
 *
 * Over the customer's cap, the amount is stored but is NOT collectable: the
 * confirmation screen asks them to approve the overage first. The rider is told
 * that in the response so they can settle it at the counter rather than discover
 * it at the door.
 */

/** Buying happens between collecting the goods and arriving — not before. */
const CAN_RECORD = new Set([
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orderId } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      customerId: true,
      serviceType: true,
      orderStatus: true,
      assignedRiderId: true,
      estimatedDeliveryFeeXaf: true,
      finalDeliveryFeeXaf: true,
      goodsCapXaf: true,
      goodsActualXaf: true,
      overCapApprovedXaf: true,
      tipXaf: true,
      paymentMethod: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = ADMIN_ROLES.includes(user.role);
  const isTheirRider = order.assignedRiderId === user.id;
  if (!isAdmin && !isTheirRider) {
    return NextResponse.json({ error: "Not your order" }, { status: 403 });
  }
  if (!isShoppingService(order.serviceType)) {
    return NextResponse.json(
      { error: "Nothing is bought on this service." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const amountXaf = Math.trunc(Number(body.amountXaf));
  const receiptUrl = typeof body.receiptUrl === "string" ? body.receiptUrl.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!Number.isFinite(amountXaf) || amountXaf <= 0) {
    return NextResponse.json({ error: "Enter what the shop charged." }, { status: 400 });
  }
  // No receipt, no charge. This is the evidence the customer is owed.
  if (!receiptUrl) {
    return NextResponse.json(
      { error: "Photograph the shop's receipt before recording the amount." },
      { status: 400 }
    );
  }

  // A rider records once. Correcting a recorded amount moves somebody's money,
  // so it takes an admin and a stated reason.
  const alreadyRecorded = order.goodsActualXaf != null;
  if (alreadyRecorded && !isAdmin) {
    return NextResponse.json(
      { error: "This is already recorded. Ask dispatch to correct it." },
      { status: 409 }
    );
  }
  if (alreadyRecorded && isAdmin && reason.length < 3) {
    return NextResponse.json({ error: "Give a reason for the correction." }, { status: 400 });
  }
  if (!alreadyRecorded && !CAN_RECORD.has(order.orderStatus)) {
    return NextResponse.json(
      { error: "You can record this once you're on the way to the shop." },
      { status: 409 }
    );
  }

  // The company funds the shopping, not the rider. If the float in their hand
  // does not cover this, recording it would mean they paid from their own pocket
  // — the exact thing the float exists to prevent. An admin correcting an
  // already-recorded figure is fixing the books, not spending, so it does not
  // apply to them.
  if (!alreadyRecorded && order.assignedRiderId) {
    const float = await loadRiderFloat(order.assignedRiderId);
    if (float && !canCoverPurchase(float.account, float.entries, amountXaf, float.advancedXaf)) {
      return NextResponse.json(
        {
          error:
            float.limitXaf <= 0
              ? "You have no float yet. Ask dispatch to give you one before buying anything."
              : `Your float only covers ${groupXaf(float.spendableXaf)} XAF right now. Call dispatch before you pay.`,
          spendableXaf: float.spendableXaf,
        },
        { status: 409 }
      );
    }
  }

  const feeXaf = order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0;
  const money = orderMoney({
    serviceType: order.serviceType,
    deliveryFeeXaf: feeXaf,
    goodsCapXaf: order.goodsCapXaf,
    goodsActualXaf: amountXaf,
    overCapApprovedXaf: order.overCapApprovedXaf,
    tipXaf: order.tipXaf,
  });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        goodsActualXaf: amountXaf,
        goodsReceiptUrl: receiptUrl,
        goodsRecordedAt: new Date(),
        goodsRecordedById: user.id,
        // What the rider laid out from the float. Comes off what they owe at
        // settlement, so shopping never leaves them out of pocket.
        goodsAdvancedXaf: amountXaf,
      },
    });

    // Cash settles once at the door, so the payable is the whole thing. On
    // mobile money the fee was already taken and the goods are handed over in
    // cash — the payment row stays the fee and must not be inflated here.
    if (order.paymentMethod === "CASH" && !money.needsCustomerApproval) {
      await tx.payment.updateMany({
        where: { orderId, status: { in: ["PENDING", "SUBMITTED_UNVERIFIED"] } },
        data: { amountXaf: money.totalXaf },
      });
    }
  });

  await recordAudit({
    entityType: "order",
    entityId: orderId,
    entityLabel: order.orderCode,
    action: alreadyRecorded ? "GOODS_CORRECTED" : "GOODS_RECORDED",
    actor: user,
    reason: alreadyRecorded
      ? `${amountXaf} XAF — ${reason.slice(0, 160)}`
      : `Shop charged ${amountXaf} XAF against a ${order.goodsCapXaf ?? 0} cap`,
  });

  // Over the cap: the customer has to agree before this is collectable, and they
  // should hear about it while the rider is still at the counter.
  if (money.needsCustomerApproval && order.customerId) {
    await notifyCustomerStatus(
      order.customerId,
      order.orderCode,
      `The shop charged ${groupXaf(amountXaf)} XAF — ${groupXaf(money.overCapByXaf)} over your cap. Please approve.`
    ).catch(() => {});
  }

  // A second reading of the same piece of paper, after the rider is already
  // done. Deliberately not awaited into the response: the rider is standing at
  // a counter and must never wait on a model, and a receipt that cannot be read
  // is not a problem with their order. A disagreement becomes a question for
  // dispatch, never a change to the amount.
  if (receiptUrl) {
    // Kept fire-and-forget on purpose, and so is its reason: nobody is standing
    // in front of this, so there is no screen to put a sentence on. The failure
    // is recorded in `AiCall` and shows on /admin/settings with a date and a
    // build marker, which is the right home for a failure nobody is waiting on.
    void readReceipt(receiptUrl, orderId)
      .then(({ data: reading }) =>
        reading
          ? prisma.order.update({
              where: { id: orderId },
              data: { goodsReceiptReadXaf: reading.totalXaf, goodsReceiptReadAt: new Date() },
            })
          : null
      )
      .catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    goodsXaf: money.goodsXaf,
    deliveryFeeXaf: money.deliveryFeeXaf,
    totalXaf: money.totalXaf,
    needsCustomerApproval: money.needsCustomerApproval,
    overCapByXaf: money.overCapByXaf,
  });
}
