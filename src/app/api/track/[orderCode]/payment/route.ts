import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { notifyPaymentSubmitted } from "@/lib/notify/triggers";

/**
 * POST /api/track/[orderCode]/payment — customer reports they've paid to the
 * merchant code and submits the transaction reference. Marks payment as
 * "submitted, unverified"; the dispatcher still confirms receipt. The system
 * NEVER auto-confirms from customer input.
 *
 * Ownership is required: an order code alone must not let a third party mark an
 * order as paid or overwrite its payment proof. The caller must either hold the
 * order-access cookie (they placed the order, or passed the code + phone check)
 * or supply the WhatsApp number on the order.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = await req.json().catch(() => ({}));
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 100) : "";
  const paymentPhone = typeof body.paymentPhone === "string" ? body.paymentPhone.trim().slice(0, 20) : "";
  const screenshotUrl = typeof body.screenshotUrl === "string" ? body.screenshotUrl.trim().slice(0, 500) : "";
  // Accept the submission if the customer gives EITHER a reference OR a screenshot.
  if (!reference && !screenshotUrl) return NextResponse.json({ error: "reference or screenshot required" }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      id: true,
      orderCode: true,
      customerId: true,
      paymentMethod: true,
      estimatedDeliveryFeeXaf: true,
      finalDeliveryFeeXaf: true,
      customer: { select: { whatsappNumber: true } },
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  // Ownership check — cookie proof, or the WhatsApp number used on the order.
  const claimedPhone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const owns =
    (await hasOrderAccess(orderCode)) ||
    (claimedPhone.length > 0 && normalizePhone(order.customer.whatsappNumber) === claimedPhone);
  if (!owns) return NextResponse.json({ error: "Verification required" }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "SUBMITTED_UNVERIFIED" } });
    const payment = await tx.payment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
    const data = {
      transactionReference: reference || undefined,
      paymentPhone: paymentPhone || undefined,
      proofScreenshotUrl: screenshotUrl || undefined,
      status: "SUBMITTED_UNVERIFIED" as const,
    };
    if (payment) await tx.payment.update({ where: { id: payment.id }, data });
    else
      await tx.payment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          paymentMethod: order.paymentMethod,
          amountXaf: order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0,
          ...data,
        },
      });
  });

  // A payment nobody sees is a delivery that never starts. Alert dispatch the
  // moment the customer says they've paid.
  await notifyPaymentSubmitted(
    order.orderCode,
    order.id,
    order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf
  );

  return NextResponse.json({ ok: true });
}
