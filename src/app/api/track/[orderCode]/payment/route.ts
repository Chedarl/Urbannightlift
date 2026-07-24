import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/track/[orderCode]/payment — customer reports they've paid to the
 * merchant code and submits the transaction reference. Marks payment as
 * "submitted, unverified"; the dispatcher still confirms receipt. The system
 * NEVER auto-confirms from customer input.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = await req.json().catch(() => ({}));
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 100) : "";
  const paymentPhone = typeof body.paymentPhone === "string" ? body.paymentPhone.trim().slice(0, 20) : "";
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: { id: true, customerId: true, paymentMethod: true, estimatedDeliveryFeeXaf: true, finalDeliveryFeeXaf: true },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "SUBMITTED_UNVERIFIED" } });
    const payment = await tx.payment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
    const data = {
      transactionReference: reference,
      paymentPhone: paymentPhone || undefined,
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

  return NextResponse.json({ ok: true });
}
