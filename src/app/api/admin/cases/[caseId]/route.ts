import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";
import { readCase, type CasePriority, type CaseStatus } from "@/lib/support/sla";
import { readCustomer } from "@/lib/customers/health";

export const dynamic = "force-dynamic";

const FAILED_ORDER = ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_UNL", "REJECTED", "FAILED_DELIVERY"];

/**
 * GET /api/admin/cases/[caseId] — one case, everything needed to resolve it
 * without leaving it: the whole thread, and a compact read of the customer
 * behind it (who they are to us, and the order this is about).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { caseId } = await params;
  const c = await prisma.supportRequest.findUnique({
    where: { id: caseId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      order: { select: { id: true, orderCode: true, orderStatus: true, serviceType: true } },
      customer: {
        select: {
          id: true,
          fullName: true,
          whatsappNumber: true,
          tags: true,
          blockedAt: true,
          createdAt: true,
          referralCreditXaf: true,
          orders: { select: { orderStatus: true, createdAt: true, finalDeliveryFeeXaf: true, quotedFeeXaf: true } },
          cases: { select: { status: true } },
        },
      },
    },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let customer = null;
  if (c.customer) {
    const cu = c.customer;
    const delivered = cu.orders.filter((o) => o.orderStatus === "DELIVERED" || o.orderStatus === "CLOSED");
    const cancelled = cu.orders.filter((o) => FAILED_ORDER.includes(o.orderStatus));
    const read = readCustomer({
      delivered: delivered.length,
      cancelled: cancelled.length,
      complaints: cu.cases.length,
      openCases: cu.cases.filter((k) => k.status !== "RESOLVED" && k.status !== "CLOSED").length,
      lifetimeSpendXaf: delivered.reduce((s, o) => s + (o.finalDeliveryFeeXaf ?? o.quotedFeeXaf ?? 0), 0),
      lastOrderAt: cu.orders.length ? cu.orders.map((o) => o.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] : null,
      blockedAt: cu.blockedAt,
      createdAt: cu.createdAt,
    });
    customer = {
      id: cu.id,
      fullName: cu.fullName,
      whatsappNumber: cu.whatsappNumber,
      tags: cu.tags,
      creditXaf: cu.referralCreditXaf,
      delivered: delivered.length,
      tier: read.tier,
      risk: read.risk,
      summary: read.summary,
    };
  }

  return NextResponse.json({
    case: {
      id: c.id,
      who: c.customer?.fullName ?? c.fullName,
      whatsappNumber: c.whatsappNumber,
      email: c.email,
      category: c.category,
      source: c.source,
      priority: c.priority,
      status: c.status,
      message: c.message,
      createdAt: c.createdAt,
      assignedToUserId: c.assignedToUserId,
      ...readCase(
        {
          status: c.status as CaseStatus,
          priority: c.priority as CasePriority,
          createdAt: c.createdAt,
          lastCustomerMessageAt: c.lastCustomerMessageAt,
          lastStaffMessageAt: c.lastStaffMessageAt,
        },
        new Date()
      ),
    },
    order: c.order,
    customer,
    messages: c.messages.map((m) => ({
      id: m.id,
      body: m.body,
      authorType: m.authorType,
      authorName: m.authorName,
      internal: m.internal,
      createdAt: m.createdAt,
    })),
  });
}
