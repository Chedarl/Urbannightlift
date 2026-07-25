import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import {
  ORDER_ACCESS_COOKIE,
  grantOrderAccessValue,
  orderAccessCookieOptions,
} from "@/lib/orders/orderAccess";

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

  // Code + phone matched: the visitor owns this order, so grant access to its
  // private details (delivery OTP, contact, addresses) on the confirmation page.
  const res = NextResponse.json({ found: true, orderCode: order.orderCode });
  res.cookies.set(
    ORDER_ACCESS_COOKIE,
    grantOrderAccessValue(req.cookies.get(ORDER_ACCESS_COOKIE)?.value, order.orderCode),
    orderAccessCookieOptions()
  );
  return res;
}
