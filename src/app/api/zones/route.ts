import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/** GET /api/zones — public: active zones for the order form's pricing lookup. */
export async function GET() {
  const zones = await prisma.zone.findMany({
    where: { active: true },
    orderBy: { zoneName: "asc" },
    select: {
      id: true,
      zoneName: true,
      feeXaf: true,
      medicineFeeXaf: true,
      nightUrgencyFeeXaf: true,
      tier: true,
      centroidLat: true,
      centroidLng: true,
      safetyLevel: true,
    },
  });
  return NextResponse.json({ zones });
}

/** POST /api/zones — Owner only: create a zone. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.zoneName || typeof body.feeXaf !== "number") {
    return NextResponse.json({ error: "zoneName and feeXaf required" }, { status: 400 });
  }
  const zone = await prisma.zone.create({
    data: {
      zoneName: body.zoneName,
      description: body.description || null,
      feeXaf: body.feeXaf,
      nightUrgencyFeeXaf: body.nightUrgencyFeeXaf ?? 0,
      medicineFeeXaf: body.medicineFeeXaf ?? 0,
      waitingFeeXaf: body.waitingFeeXaf ?? 0,
      tier: body.tier ?? "GREEN",
      centroidLat: body.centroidLat ?? null,
      centroidLng: body.centroidLng ?? null,
      safetyLevel: body.safetyLevel ?? "SAFE",
      active: body.active ?? true,
      notes: body.notes || null,
    },
  });
  return NextResponse.json({ zone }, { status: 201 });
}
