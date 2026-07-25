import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit, diffFields } from "@/lib/audit";
import { notifyRiderAssigned } from "@/lib/notify/triggers";

/**
 * PATCH /api/orders/[orderId] — staff edits to order fields (fees, flags,
 * rider assignment, notes). Status changes go through /status. Payment
 * verification goes through /payments/[orderId]/verify.
 *
 * Every change here is written to the audit log. This endpoint can move money
 * — it sets the delivery fee — and until now it recorded nothing about who
 * changed what.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.finalDeliveryFeeXaf === "number") data.finalDeliveryFeeXaf = body.finalDeliveryFeeXaf;
  if (typeof body.totalAmountDueXaf === "number") data.totalAmountDueXaf = body.totalAmountDueXaf;
  if (typeof body.riskFlag === "boolean") data.riskFlag = body.riskFlag;
  if (typeof body.highValueFlag === "boolean") data.highValueFlag = body.highValueFlag;
  if (typeof body.adminNotes === "string") data.adminNotes = body.adminNotes;
  if (typeof body.customerVisibleNotes === "string") data.customerVisibleNotes = body.customerVisibleNotes;
  if (typeof body.isTest === "boolean") data.isTest = body.isTest;

  let assignedRider: { id: string; fullName: string } | null = null;
  if ("assignedRiderId" in body) {
    const riderId = body.assignedRiderId || null;
    if (riderId) {
      // A rider may only be committed to a trip the customer has agreed to pay
      // for; otherwise we can send someone out on a price that was never
      // accepted and eat the trip when it is refused at the door.
      if (!existing.quoteAcceptedAt) {
        return NextResponse.json(
          { error: "The customer has not accepted the quoted price yet", code: "QUOTE_NOT_ACCEPTED" },
          { status: 409 }
        );
      }
      const rider = await prisma.user.findFirst({
        where: { id: riderId, role: "RIDER", status: "ACTIVE" },
        select: { id: true, fullName: true },
      });
      if (!rider) return NextResponse.json({ error: "Invalid rider" }, { status: 400 });
      assignedRider = rider;
    }
    data.assignedRiderId = riderId;
    // Assignment is an offer. Clear any previous answer and start the clock, so
    // dispatch can see how long this rider has been silent.
    if (riderId !== existing.assignedRiderId) {
      data.assignedAt = riderId ? new Date() : null;
      data.riderAcceptedAt = null;
      data.riderDeclinedAt = null;
      data.riderDeclineReason = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const updated = await prisma.order.update({ where: { id: orderId }, data });

  const changes = diffFields(existing as unknown as Record<string, unknown>, data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({
      actor: user,
      action: "assignedRiderId" in changes ? "order.rider_assigned" : "order.updated",
      entityType: "order",
      entityId: orderId,
      entityLabel: existing.orderCode,
      changes,
      reason: typeof body.reason === "string" ? body.reason : null,
    });
  }

  // Tell the rider they have been offered a job. Best-effort: a failed push
  // must never fail the assignment.
  if (assignedRider && assignedRider.id !== existing.assignedRiderId) {
    await notifyRiderAssigned(assignedRider.id, updated.orderCode, updated.id);
  }

  return NextResponse.json({ ok: true, order: { id: updated.id } });
}
