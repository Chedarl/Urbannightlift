import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/orders/[orderId]/notified — dispatch records that they have
 * actually told this customer.
 *
 * Web Push only reaches customers who opted in, and many never will. The
 * dependable channel here is still WhatsApp, sent by a person. This marks the
 * moment that happened, so "has anyone told them their order was accepted?"
 * becomes a fact on the order instead of an assumption — and an order nobody
 * has told the customer about shows up on the dispatch board.
 */
const STAGES = ["QUOTE", "DISPATCH", "OTHER"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const stage = typeof body.stage === "string" && STAGES.includes(body.stage) ? body.stage : "OTHER";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderCode: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  await prisma.order.update({
    where: { id: orderId },
    data: { customerNotifiedAt: now, customerNotifiedStage: stage },
  });

  await recordAudit({
    actor: user,
    action: "order.customer_notified",
    entityType: "order",
    entityId: orderId,
    entityLabel: order.orderCode,
    changes: { customerNotifiedStage: { from: null, to: stage } },
  });

  return NextResponse.json({ ok: true, at: now });
}
