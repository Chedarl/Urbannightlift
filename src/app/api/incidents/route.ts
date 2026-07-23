import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/** GET /api/incidents — staff: list incidents. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { order: { select: { orderCode: true } } },
  });
  return NextResponse.json({ incidents });
}

/**
 * POST /api/incidents — staff (incl. riders reporting delivery issues).
 * Rider-reported issues surface immediately in the admin complaints log.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.incidentType || !body.description) {
    return NextResponse.json({ error: "incidentType and description required" }, { status: 400 });
  }

  let orderId: string | null = null;
  if (body.orderCode) {
    const order = await prisma.order.findUnique({ where: { orderCode: String(body.orderCode).toUpperCase() } });
    orderId = order?.id ?? null;
  } else if (body.orderId) {
    orderId = body.orderId;
  }

  // A rider reporting an issue on their order also risk-flags it for dispatch.
  if (orderId && user.role === "RIDER") {
    await prisma.order.update({ where: { id: orderId }, data: { riskFlag: true } }).catch(() => {});
  }

  const incident = await prisma.incident.create({
    data: {
      orderId,
      incidentType: body.incidentType,
      description: body.description,
      responsibleParty: body.responsibleParty ?? "UNKNOWN",
      resolutionStatus: body.resolutionStatus ?? "OPEN",
      internalNotes: body.internalNotes || null,
      reportedByUserId: user.id,
    },
  });
  return NextResponse.json({ incident }, { status: 201 });
}
