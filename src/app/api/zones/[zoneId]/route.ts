import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/** PATCH/DELETE /api/zones/[zoneId] — Owner only (pricing & zones). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const key of [
    "zoneName",
    "description",
    "feeXaf",
    "nearbyFeeXaf",
    "extendedFeeXaf",
    "nightUrgencyFeeXaf",
    "medicineFeeXaf",
    "waitingFeeXaf",
    "safetyLevel",
    "active",
    "notes",
  ]) {
    if (key in body) data[key] = body[key];
  }
  const zone = await prisma.zone.update({ where: { id: zoneId }, data });
  return NextResponse.json({ zone });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Soft-delete to preserve order history references.
  await prisma.zone.update({ where: { id: zoneId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
