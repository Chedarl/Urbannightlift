import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET — the desk's saved answers, most-used first. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const replies = await prisma.cannedReply.findMany({
    where: { active: true },
    orderBy: [{ useCount: "desc" }, { title: "asc" }],
    take: 50,
    select: { id: true, title: true, body: true, category: true },
  });
  return NextResponse.json({ replies });
}

/** POST { id } — count a use, so the list keeps sorting by what actually helps. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.id === "string") {
    await prisma.cannedReply.update({ where: { id: body.id }, data: { useCount: { increment: 1 } } }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
