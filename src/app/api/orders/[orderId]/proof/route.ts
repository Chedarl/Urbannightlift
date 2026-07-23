import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/**
 * POST /api/orders/[orderId]/proof — rider submits pickup/delivery proof.
 * For DELIVERY-stage OTP proof, the entered code must match the order's OTP.
 * Records a DeliveryProof row; DELIVERED transition later checks proof exists.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role === "RIDER" && order.assignedRiderId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const stage = body.stage === "PICKUP" ? "PICKUP" : "DELIVERY";
  const otpEntered = typeof body.otpEntered === "string" ? body.otpEntered.trim() : null;
  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl : null;
  const riderNote = typeof body.riderNote === "string" ? body.riderNote : null;

  if (!otpEntered && !photoUrl && !riderNote) {
    return NextResponse.json({ error: "Provide OTP, photo, or note" }, { status: 400 });
  }

  // Validate OTP for delivery proof.
  if (stage === "DELIVERY" && otpEntered && order.otpCode && otpEntered !== order.otpCode) {
    return NextResponse.json({ error: "OTP mismatch" }, { status: 400 });
  }

  const proofMethod = otpEntered && photoUrl ? "BOTH" : otpEntered ? "OTP" : "PHOTO";

  const proof = await prisma.deliveryProof.create({
    data: {
      orderId,
      stage,
      proofMethod,
      otpEntered,
      photoUrl,
      riderNote,
      submittedByUserId: user.id,
    },
  });

  return NextResponse.json({ proof: { id: proof.id } }, { status: 201 });
}
