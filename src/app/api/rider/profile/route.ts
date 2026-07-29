import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * A rider maintaining their own identity details.
 *
 * They can supply and correct their photo, bike and ID — but they cannot mark
 * themselves verified. `idVerifiedAt` is set only by staff who have looked at
 * the document, and re-submitting an ID clears any previous verification, so a
 * rider cannot get verified on a real card and then quietly swap in another.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rider = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      fullName: true,
      phone: true,
      photoUrl: true,
      vehicleRef: true,
      idCardNumber: true,
      idCardFrontUrl: true,
      idCardBackUrl: true,
      idVerifiedAt: true,
    },
  });

  return NextResponse.json({ rider });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : undefined);

  const data: Record<string, unknown> = {};
  if (str(body.photoUrl, 500) !== undefined) data.photoUrl = str(body.photoUrl, 500);
  if (str(body.vehicleRef, 120) !== undefined) data.vehicleRef = str(body.vehicleRef, 120);
  if (str(body.phone, 20) !== undefined) data.phone = str(body.phone, 20);

  const idFields = ["idCardNumber", "idCardFrontUrl", "idCardBackUrl"] as const;
  let idChanged = false;
  for (const key of idFields) {
    const max = key === "idCardNumber" ? 60 : 500;
    const value = str(body[key], max);
    if (value !== undefined) {
      data[key] = value;
      idChanged = true;
    }
  }

  // Changing the document invalidates the check that was done on the old one.
  if (idChanged) {
    data.idVerifiedAt = null;
    data.idVerifiedById = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data });

  await recordAudit({
    actor: { id: user.id, fullName: user.fullName, role: user.role },
    action: idChanged ? "rider.id_submitted" : "rider.profile_updated",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.fullName,
  });

  return NextResponse.json({ ok: true, reverifyNeeded: idChanged });
}
