import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import type { CasePriority, SupportStatus } from "@prisma/client";

const STATUSES: SupportStatus[] = ["NEW", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"];
const PRIORITIES: CasePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

/**
 * PATCH /api/support/[requestId] — the desk moves a case along.
 *
 * Status, priority and assignment in one place. Resolving or closing stamps
 * `resolvedAt` so the metrics can tell a finished case from an abandoned one;
 * parking it on the customer takes it out of the "waiting on us" queue without
 * pretending it is done.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.supportRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, priority: true, resolvedAt: true, orderCode: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: {
    status?: SupportStatus;
    priority?: CasePriority;
    assignedToUserId?: string | null;
    handledByUserId?: string;
    resolvedAt?: Date | null;
  } = { handledByUserId: user.id };

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
    const done = body.status === "RESOLVED" || body.status === "CLOSED";
    // First time it is resolved/closed we stamp the clock; reopening clears it
    // so the "how long did it take" metric never counts a reopened case as done.
    if (done && !existing.resolvedAt) data.resolvedAt = new Date();
    if (!done && existing.resolvedAt) data.resolvedAt = null;
  }

  if (typeof body.priority === "string") {
    if (!PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    data.priority = body.priority;
  }

  if ("assignedToUserId" in body) {
    data.assignedToUserId =
      typeof body.assignedToUserId === "string" && body.assignedToUserId ? body.assignedToUserId : null;
  }

  const updated = await prisma.supportRequest.update({ where: { id: requestId }, data });

  await recordAudit({
    actor: user,
    action: "CASE_UPDATED",
    entityType: "order",
    entityId: existing.orderCode ?? requestId,
    entityLabel: existing.orderCode ?? `case ${requestId.slice(-6)}`,
    changes: {
      ...(data.status ? { status: { from: existing.status, to: data.status } } : {}),
      ...(data.priority ? { priority: { from: existing.priority, to: data.priority } } : {}),
    },
  });

  return NextResponse.json({ request: updated });
}
