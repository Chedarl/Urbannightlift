import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { sendPush } from "@/lib/notify/push";
import type { SupportCategory } from "@prisma/client";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  whatsappNumber: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  orderCode: z.string().trim().max(40).optional().or(z.literal("")),
  category: z.enum(["ORDER_ISSUE", "PAYMENT", "DELIVERY_AREA", "BECOME_RIDER", "PARTNERSHIP", "OTHER"]),
  message: z.string().trim().min(5).max(2000),
});

const DISPATCH_ROLES = ["OWNER", "DISPATCHER", "SUPPORT"];

/**
 * POST /api/support — public: a Help Centre message.
 *
 * The message must be written as the first entry in the case thread, not only
 * into the `message` column. Support became a conversation, and the admin view
 * renders that conversation — so a request with no thread entry arrived as a
 * blank card with the customer's words nowhere on screen, and never counted as
 * waiting on us. A support system that silently loses the question is worse
 * than not having one.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  const d = parsed.data;
  const now = new Date();

  // Tie the message to the order and the customer whenever we can identify
  // them, so support can see who they are talking to and what about.
  const orderCode = d.orderCode ? d.orderCode.trim().toUpperCase() : null;
  const phone = d.whatsappNumber ? normalizePhone(d.whatsappNumber) : "";

  const [order, customer] = await Promise.all([
    orderCode
      ? prisma.order.findUnique({ where: { orderCode }, select: { id: true, customerId: true } })
      : null,
    phone
      ? prisma.customer.findFirst({ where: { whatsappNumber: phone }, select: { id: true } })
      : null,
  ]);

  const created = await prisma.supportRequest.create({
    data: {
      fullName: d.fullName,
      whatsappNumber: d.whatsappNumber || null,
      email: d.email || null,
      orderCode,
      orderId: order?.id ?? null,
      customerId: customer?.id ?? order?.customerId ?? null,
      category: d.category as SupportCategory,
      message: d.message,
      lastCustomerMessageAt: now,
      messages: {
        create: {
          body: d.message,
          authorType: "CUSTOMER",
          authorName: d.fullName,
          createdAt: now,
        },
      },
    },
  });

  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: `New support message from ${d.fullName}`,
      body: d.message.slice(0, 120),
      url: "/admin/support",
      tag: `case-${created.id}`,
    }
  ).catch(() => 0);

  return NextResponse.json({ id: created.id }, { status: 201 });
}
