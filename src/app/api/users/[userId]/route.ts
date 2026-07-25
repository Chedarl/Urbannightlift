import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit, diffFields } from "@/lib/audit";

/**
 * PATCH /api/users/[userId] — Owner only: suspend/reactivate a staff member,
 * and set which zones a rider covers.
 *
 * Zone coverage is not cosmetic. Operations that reach high first-attempt
 * success keep riders in consistent areas so local knowledge accumulates,
 * which matters more here than in cities with street addresses, because
 * finding the place *is* the job.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const actor = await getSessionUser();
  if (!actor || actor.role !== "OWNER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!["ACTIVE", "SUSPENDED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    // Suspending yourself would lock the owner out of their own console.
    if (actor.id === userId) {
      return NextResponse.json({ error: "Cannot change your own status" }, { status: 400 });
    }
    data.status = body.status;
  }

  if (Array.isArray(body.zoneIds)) {
    if (existing.role !== "RIDER") {
      return NextResponse.json({ error: "Only riders cover zones" }, { status: 400 });
    }
    const ids = (body.zoneIds as unknown[]).filter((z): z is string => typeof z === "string");
    // Drop anything that isn't a real zone rather than storing dead ids.
    const zones = await prisma.zone.findMany({ where: { id: { in: ids } }, select: { id: true } });
    data.zoneIds = zones.map((z) => z.id);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const user = await prisma.user.update({ where: { id: userId }, data });

  const changes = diffFields(existing as unknown as Record<string, unknown>, data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({
      actor,
      action: "user.updated",
      entityType: "user",
      entityId: userId,
      entityLabel: existing.fullName,
      changes,
    });
  }

  return NextResponse.json({ user: { id: user.id, status: user.status, zoneIds: user.zoneIds } });
}
