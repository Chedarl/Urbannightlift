import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/**
 * POST /api/rider/availability — the rider says whether they are working.
 *
 * Dispatch had no way to know who was actually out before assigning, so jobs
 * went to whoever was top of a list and then sat unanswered. A rider marking
 * themselves offline is far cheaper than a delivery discovering it.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const isOnline = body.isOnline === true;

  await prisma.user.update({
    where: { id: user.id },
    data: { isOnline, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true, isOnline });
}
