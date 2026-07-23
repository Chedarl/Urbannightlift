import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";

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

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status as never } });
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

  return NextResponse.json({ paymentStatus: status });
}
