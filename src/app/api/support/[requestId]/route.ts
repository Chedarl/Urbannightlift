import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";

/** PATCH /api/support/[requestId] — dispatch updates the handling status. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body.status;
  if (!["NEW", "IN_PROGRESS", "RESOLVED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.supportRequest.update({
    where: { id: requestId },
    data: { status, handledByUserId: user.id },
  });
  return NextResponse.json({ request: updated });
}
