import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/orders/bulk — mark every order placed before a cut-off as test
 * data (or archive them).
 *
 * This exists for one specific job: the launch period produced a pile of test
 * orders that are now indistinguishable from real ones, and clearing them one
 * at a time is not realistic. OWNER only, because it moves the revenue numbers.
 *
 * Orders with a verified payment are never swept up — if money actually
 * changed hands, it was not a test.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can bulk-edit orders" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const before = typeof body.before === "string" ? new Date(body.before) : null;
  const action = body.action === "archive" ? "archive" : "markTest";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  if (!before || Number.isNaN(before.getTime())) {
    return NextResponse.json({ error: "A valid cut-off date is required" }, { status: 400 });
  }

  const where = {
    createdAt: { lt: before },
    paymentStatus: { not: "VERIFIED" as const },
    ...(action === "markTest" ? { isTest: false } : { archivedAt: null }),
  };

  // Capture the codes before the update so the audit row says exactly what was
  // swept, not just how many.
  const affected = await prisma.order.findMany({ where, select: { orderCode: true }, take: 500 });
  if (affected.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const result = await prisma.order.updateMany({
    where,
    data:
      action === "markTest"
        ? { isTest: true }
        : { archivedAt: new Date(), archivedByUserId: user.id, archiveReason: reason || "Bulk archive" },
  });

  await recordAudit({
    actor: user,
    action: action === "markTest" ? "order.bulk_marked_test" : "order.bulk_archived",
    entityType: "order",
    entityId: "bulk",
    entityLabel: `${result.count} orders before ${before.toISOString().slice(0, 10)}`,
    changes: { orderCodes: { from: null, to: affected.map((o) => o.orderCode) } },
    reason: reason || null,
  });

  return NextResponse.json({ ok: true, count: result.count });
}
