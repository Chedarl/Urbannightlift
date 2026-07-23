import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";

/**
 * POST /api/orders/track — guest order lookup: order code + the WhatsApp
 * number used on the order must both match.
 */
export async function POST(req: NextRequest) {
  let body: { orderCode?: string; whatsappNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = (body.orderCode ?? "").trim().toUpperCase();
  const phone = normalizePhone(body.whatsappNumber ?? "");
  if (!code || !phone) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { orderCode: code },
    include: { customer: { select: { whatsappNumber: true } } },
  });

  if (!order || normalizePhone(order.customer.whatsappNumber) !== phone) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({ found: true, orderCode: order.orderCode });
}
