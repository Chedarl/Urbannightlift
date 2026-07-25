import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/track/[orderCode]/quote — the customer agrees to, or refuses, the
 * price dispatch quoted them.
 *
 * This is the handshake the business was missing. Accepting freezes the price
 * and releases the order for rider assignment; declining cancels it before
 * anyone rides anywhere, which is far cheaper than a refusal at the door.
 *
 * Ownership is required, on the same terms as the payment endpoint — an order
 * code alone must not let a stranger accept a price on someone else's behalf.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = await req.json().catch(() => ({}));
  const accept = body.accept === true;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      id: true,
      orderCode: true,
      orderStatus: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quotedFeeXaf: true,
      customer: { select: { whatsappNumber: true, fullName: true } },
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  const claimedPhone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const owns =
    (await hasOrderAccess(orderCode)) ||
    (claimedPhone.length > 0 && normalizePhone(order.customer.whatsappNumber) === claimedPhone);
  if (!owns) return NextResponse.json({ error: "Verification required" }, { status: 403 });

  if (!order.quoteSentAt) {
    return NextResponse.json({ error: "This order has not been priced yet" }, { status: 409 });
  }
  if (order.quoteAcceptedAt) {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (accept) {
      await tx.order.update({
        where: { id: order.id },
        data: { quoteAcceptedAt: now, orderStatus: "AWAITING_PAYMENT" },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.orderStatus,
          toStatus: "AWAITING_PAYMENT",
          changedByRole: "CUSTOMER",
          note: `Customer accepted ${order.quotedFeeXaf ?? "the"} XAF delivery fee`,
        },
      });
    } else {
      await tx.order.update({
        where: { id: order.id },
        data: {
          quoteDeclinedAt: now,
          quoteDeclineReason: reason || null,
          orderStatus: "CANCELLED_BY_CUSTOMER",
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.orderStatus,
          toStatus: "CANCELLED_BY_CUSTOMER",
          changedByRole: "CUSTOMER",
          note: reason ? `Declined the quoted price — ${reason}` : "Declined the quoted price",
        },
      });
    }
  });

  // Logged against the customer as actor, so a disputed price has a record of
  // who agreed to what and when.
  await recordAudit({
    actor: { fullName: order.customer.fullName, role: "CUSTOMER" },
    action: accept ? "order.quote_accepted" : "order.quote_declined",
    entityType: "order",
    entityId: order.id,
    entityLabel: order.orderCode,
    changes: { quotedFeeXaf: { from: order.quotedFeeXaf, to: order.quotedFeeXaf } },
    reason: reason || null,
  });

  return NextResponse.json({ ok: true, accepted: accept });
}
