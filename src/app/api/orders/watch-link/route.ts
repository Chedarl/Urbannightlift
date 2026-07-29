import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { createWatchToken, watchUrl, watchWindowOpen } from "@/lib/orders/watchLink";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/watch-link — mints a link the customer can send to somebody
 * they trust.
 *
 * Only the person who owns the order may create one. An order code travels
 * through WhatsApp and screenshots, so letting anyone holding a code mint a
 * tracking link for somebody else's delivery would invert the entire point of
 * the feature: the customer decides who watches them get home, not whoever
 * happens to have seen their receipt.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orderCode = typeof body.orderCode === "string" ? body.orderCode.toUpperCase() : "";
  if (!orderCode) return NextResponse.json({ error: "invalid" }, { status: 400 });

  if (!(await hasOrderAccess(orderCode))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { orderCode },
    select: { orderStatus: true, completedAt: true, customerConfirmedAt: true },
  });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!watchWindowOpen(order)) {
    return NextResponse.json({ error: "This delivery is already finished." }, { status: 409 });
  }

  const token = createWatchToken(orderCode);
  return NextResponse.json({ url: watchUrl(token, req.nextUrl.origin) });
}
