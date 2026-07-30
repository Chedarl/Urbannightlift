import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { bySla, readCase, type CasePriority, type CaseStatus } from "@/lib/support/sla";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cases — the one inbox.
 *
 * Every case a human might answer, in one list, sorted worst-first by how long
 * the customer has been waiting on us against what we promised. Open cases
 * lead; resolved/closed sink but stay visible for a couple of days so the desk
 * can see what it just handled.
 *
 * Dispatch only — a case carries a customer's message, number and order.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const since = new Date(now.getTime() - 3 * 24 * 3600_000);
  const filter = req.nextUrl.searchParams.get("filter"); // "open" | "mine" | "all"

  const rows = await prisma.supportRequest.findMany({
    where: {
      OR: [
        { status: { in: ["NEW", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } },
        { updatedAt: { gte: since } },
      ],
      ...(filter === "mine" ? { assignedToUserId: user.id } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true,
      fullName: true,
      whatsappNumber: true,
      orderCode: true,
      category: true,
      source: true,
      priority: true,
      status: true,
      message: true,
      createdAt: true,
      lastCustomerMessageAt: true,
      lastStaffMessageAt: true,
      assignedToUserId: true,
      customerId: true,
      customer: { select: { fullName: true, tags: true } },
    },
  });

  const staff = await prisma.user.findMany({
    where: { role: { in: ADMIN_ROLES } },
    select: { id: true, fullName: true },
  });
  const nameOf = new Map(staff.map((s) => [s.id, s.fullName]));

  const cases = rows
    .map((c) => {
      const read = readCase(
        {
          status: c.status as CaseStatus,
          priority: c.priority as CasePriority,
          createdAt: c.createdAt,
          lastCustomerMessageAt: c.lastCustomerMessageAt,
          lastStaffMessageAt: c.lastStaffMessageAt,
        },
        now
      );
      return {
        id: c.id,
        who: c.customer?.fullName ?? c.fullName,
        tags: c.customer?.tags ?? [],
        whatsappNumber: c.whatsappNumber,
        orderCode: c.orderCode,
        category: c.category,
        source: c.source,
        priority: c.priority,
        status: c.status,
        preview: c.message.slice(0, 140),
        createdAt: c.createdAt,
        assignedToName: c.assignedToUserId ? nameOf.get(c.assignedToUserId) ?? null : null,
        customerId: c.customerId,
        ...read,
      };
    })
    .sort(bySla);

  return NextResponse.json({
    now: now.toISOString(),
    staff,
    counts: {
      waiting: cases.filter((c) => c.waitingOnUs).length,
      breached: cases.filter((c) => c.sla === "BREACHED").length,
      open: cases.filter((c) => c.open).length,
    },
    cases,
  });
}
