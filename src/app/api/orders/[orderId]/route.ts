import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";

/**
 * PATCH /api/orders/[orderId] — staff edits to order fields (fees, flags,
 * rider assignment, notes). Status changes go through /status. Payment
 * verification goes through /payments/[orderId]/verify.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.finalDeliveryFeeXaf === "number") data.finalDeliveryFeeXaf = body.finalDeliveryFeeXaf;
  if (typeof body.totalAmountDueXaf === "number") data.totalAmountDueXaf = body.totalAmountDueXaf;
  if (typeof body.riskFlag === "boolean") data.riskFlag = body.riskFlag;
  if (typeof body.highValueFlag === "boolean") data.highValueFlag = body.highValueFlag;
  if (typeof body.adminNotes === "string") data.adminNotes = body.adminNotes;
  if (typeof body.customerVisibleNotes === "string") data.customerVisibleNotes = body.customerVisibleNotes;

  if ("assignedRiderId" in body) {
    const riderId = body.assignedRiderId || null;
    if (riderId) {
      const rider = await prisma.user.findFirst({
        where: { id: riderId, role: "RIDER", status: "ACTIVE" },
      });
      if (!rider) return NextResponse.json({ error: "Invalid rider" }, { status: 400 });
    }
    data.assignedRiderId = riderId;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const updated = await prisma.order.update({ where: { id: orderId }, data });
  return NextResponse.json({ ok: true, order: { id: updated.id } });
}
