import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { sendPush } from "@/lib/notify/push";

/**
 * The customer's side of a support case, attached to their own order.
 *
 * Before this, a complaint went into a form that stored a row nobody could
 * reply to, while the customer was told "our team will reach out soon". A case
 * is a conversation: opening one links it to the order and the customer, and
 * staff replies come back here.
 *
 * GET  — the thread for this order (public replies only, never internal notes).
 * POST — open a case, or add a message to the open one.
 */

const DISPATCH_ROLES = ["OWNER", "DISPATCHER", "SUPPORT"];

async function loadOrder(orderCode: string) {
  return prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      id: true,
      orderCode: true,
      customerId: true,
      customer: { select: { fullName: true, whatsappNumber: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const order = await loadOrder(orderCode);
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  // Reading a conversation exposes what staff said about this order, so it
  // needs the same ownership proof as everything else private.
  if (!(await hasOrderAccess(orderCode))) {
    return NextResponse.json({ error: "Verification required" }, { status: 403 });
  }

  const cases = await prisma.supportRequest.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        where: { internal: false },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({
    cases: cases.map((c) => ({
      id: c.id,
      category: c.category,
      status: c.status,
      createdAt: c.createdAt,
      messages: c.messages.map((m) => ({
        body: m.body,
        authorType: m.authorType,
        authorName: m.authorName,
        createdAt: m.createdAt,
      })),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  const category = typeof body.category === "string" ? body.category : "ORDER_ISSUE";
  if (message.length < 3) {
    return NextResponse.json({ error: "Tell us what went wrong" }, { status: 400 });
  }

  const order = await loadOrder(orderCode);
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  const claimedPhone = normalizePhone(typeof body.whatsappNumber === "string" ? body.whatsappNumber : "");
  const owns =
    (await hasOrderAccess(orderCode)) ||
    (claimedPhone.length > 0 && normalizePhone(order.customer.whatsappNumber) === claimedPhone);
  if (!owns) return NextResponse.json({ error: "Verification required" }, { status: 403 });

  const now = new Date();

  // Keep one open case per order: a customer sending three messages about the
  // same problem should not create three cases for staff to reconcile.
  const existing = await prisma.supportRequest.findFirst({
    where: { orderId: order.id, status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  });

  const caseRow = existing
    ? await prisma.supportRequest.update({
        where: { id: existing.id },
        data: { lastCustomerMessageAt: now, status: "NEW" },
      })
    : await prisma.supportRequest.create({
        data: {
          fullName: order.customer.fullName,
          whatsappNumber: order.customer.whatsappNumber,
          orderCode: order.orderCode,
          orderId: order.id,
          customerId: order.customerId,
          category: category as never,
          message,
          lastCustomerMessageAt: now,
        },
      });

  await prisma.caseMessage.create({
    data: {
      caseId: caseRow.id,
      body: message,
      authorType: "CUSTOMER",
      authorName: order.customer.fullName,
    },
  });

  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: `Customer problem on ${order.orderCode}`,
      body: message.slice(0, 120),
      url: `/admin/support`,
      tag: `case-${caseRow.id}`,
    }
  ).catch(() => 0);

  return NextResponse.json({ ok: true, caseId: caseRow.id });
}
