import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getCustomerId } from "@/lib/auth/customer";
import { pushPublicKey } from "@/lib/notify/push";
import { hasOrderAccess } from "@/lib/orders/orderAccess";

/**
 * Web Push registration.
 *
 * GET    — the VAPID public key the browser needs to subscribe. Returns
 *          enabled:false when no keys are configured, so the UI can explain
 *          that rather than failing silently.
 * POST   — register this device against the signed-in staff member or customer.
 * DELETE — unregister it.
 *
 * A subscription must belong to somebody: an anonymous endpoint could be used
 * to receive other people's order notifications.
 */
export async function GET() {
  const key = pushPublicKey();
  return NextResponse.json({ enabled: Boolean(key), publicKey: key });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.p256dh === "string" ? body.p256dh : "";
  const auth = typeof body.auth === "string" ? body.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const [staff, accountCustomerId] = await Promise.all([getSessionUser(), getCustomerId()]);

  // Most orders are placed as a guest, so requiring an account here meant the
  // people who most need to hear "your order is accepted" and "your rider is on
  // the way" could never subscribe at all. A guest who can prove they own an
  // order — the same ownership check used for the OTP and payment — may
  // subscribe for that order's customer.
  let guestCustomerId: string | null = null;
  const orderCode = typeof body.orderCode === "string" ? body.orderCode.trim() : "";
  if (!staff && !accountCustomerId && orderCode) {
    if (await hasOrderAccess(orderCode)) {
      const order = await prisma.order.findUnique({
        where: { orderCode: orderCode.toUpperCase() },
        select: { customerId: true },
      });
      guestCustomerId = order?.customerId ?? null;
    }
  }

  const customerId = accountCustomerId ?? guestCustomerId;
  if (!staff && !customerId) {
    return NextResponse.json(
      { error: "We couldn't confirm this order is yours, so alerts weren't enabled." },
      { status: 401 }
    );
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const data = {
    p256dh,
    auth,
    userAgent,
    // A device is one or the other, never both — re-registering after a role
    // change must not leave a stale owner attached.
    userId: staff?.id ?? null,
    customerId: staff ? null : customerId,
  };

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
