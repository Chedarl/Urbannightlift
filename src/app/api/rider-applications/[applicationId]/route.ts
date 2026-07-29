import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * PATCH /api/rider-applications/[id] — approve or reject somebody.
 *
 * Approving records the decision and copies the identity details onto a rider
 * account, but it does NOT mint a Supabase login on its own: staff accounts are
 * created through the existing users flow, which is where the email and
 * password live. Linking the two here keeps the trail complete — you can always
 * answer "who let this rider in, and what did they look at?".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { applicationId } = await params;
  const before = await prisma.riderApplication.findUnique({ where: { id: applicationId } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (status !== "APPROVED" && status !== "REJECTED" && status !== "PENDING") {
    return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
  }

  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.slice(0, 500) : null;

  // Attaching the application to an existing rider account carries the ID over
  // so dispatch is not re-typing a card number from a photo.
  let createdUserId: string | null = before.createdUserId;
  if (status === "APPROVED" && typeof body.userId === "string" && body.userId) {
    const rider = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, role: true } });
    if (!rider || rider.role !== "RIDER") {
      return NextResponse.json({ error: "That account is not a rider" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: rider.id },
      data: {
        photoUrl: before.photoUrl ?? undefined,
        vehicleRef: before.vehicleRef ?? undefined,
        idCardNumber: before.idCardNumber ?? undefined,
        idCardFrontUrl: before.idCardFrontUrl ?? undefined,
        idCardBackUrl: before.idCardBackUrl ?? undefined,
        // Approving the application IS the identity check.
        idVerifiedAt: new Date(),
        idVerifiedById: user.id,
        zoneIds: before.zonePreference.length ? before.zonePreference : undefined,
      },
    });
    createdUserId = rider.id;
  }

  const application = await prisma.riderApplication.update({
    where: { id: applicationId },
    data: {
      status,
      reviewNote,
      reviewedAt: status === "PENDING" ? null : new Date(),
      reviewedById: status === "PENDING" ? null : user.id,
      createdUserId,
    },
  });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: `rider_application.${status.toLowerCase()}`,
    entityType: "user",
    entityId: applicationId,
    entityLabel: application.fullName,
    changes: { status: { from: before.status, to: status } },
    reason: reviewNote,
  });

  return NextResponse.json({ application });
}
