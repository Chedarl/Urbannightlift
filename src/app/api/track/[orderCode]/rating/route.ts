import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { hasOrderAccess } from "@/lib/orders/orderAccess";

/**
 * POST /api/track/[orderCode]/rating — the customer says how it went.
 *
 * Asked once, only after the goods are in hand, and only by the person who owns
 * the order — the same ownership proof the confirm route uses, because a rating
 * is written to their order and travels into the CRM's satisfaction view.
 *
 * A rating is never a payment step and touches nothing about money, dispatch,
 * or the delivery OTP. It is one to five stars and, if they want, a few words.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = await req.json().catch(() => ({}));

  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "Pick one to five stars." }, { status: 400 });
  }
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      id: true,
      orderStatus: true,
      customerConfirmedAt: true,
      ratedAt: true,
      customer: { select: { whatsappNumber: true } },
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  const claimedPhone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const owns =
    (await hasOrderAccess(orderCode)) ||
    (claimedPhone.length > 0 && normalizePhone(order.customer.whatsappNumber) === claimedPhone);
  if (!owns) return NextResponse.json({ error: "Verification required" }, { status: 403 });

  // Rating something you have not received yet is meaningless. Confirmed
  // receipt, delivered or closed are the only points a rating makes sense.
  const rateable =
    order.customerConfirmedAt != null || order.orderStatus === "DELIVERED" || order.orderStatus === "CLOSED";
  if (!rateable) {
    return NextResponse.json({ error: "You can rate once your order has arrived." }, { status: 409 });
  }

  // Once only — a rating is a first impression, not something edited later.
  if (order.ratedAt) {
    return NextResponse.json({ ok: true, alreadyRated: true });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { ratingStars: stars, ratingComment: comment || null, ratedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
