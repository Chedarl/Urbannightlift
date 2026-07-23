import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

/** PATCH /api/users/[userId] — Owner only: suspend / reactivate a staff member. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const actor = await getSessionUser();
  if (!actor || actor.role !== "OWNER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.id === userId) return NextResponse.json({ error: "Cannot change your own status" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!["ACTIVE", "SUSPENDED"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { status: body.status } });
  return NextResponse.json({ user: { id: user.id, status: user.status } });
}
