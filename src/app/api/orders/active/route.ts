import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCustomerId } from "@/lib/auth/customer";
import { provenOrderCodes } from "@/lib/orders/orderAccess";
import { CUSTOMER_STATUS_KEY, CUSTOMER_TIMELINE } from "@/lib/orders/statusLabels";
import { isLiveOrder, orderProgress, type ActiveOrder } from "@/lib/orders/activeOrder";
import { etaMinutes, isStalePosition } from "@/lib/orders/eta";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/active — is anything happening for this viewer right now?
 *
 * This is what `LiveOrderStrip` polls, and it is one route rather than a
 * customer route plus a guest route because the question is identical either
 * way: *whose order is this, and is it still running.* Only the proof differs.
 *
 * ## Two ways to be the owner, neither of them an order code
 *
 * A signed-in customer is matched on `customerId`. A guest is matched against
 * `provenOrderCodes()` — the HMAC-signed cookie set when they placed the order
 * or passed the code-plus-number check. An order code on its own proves
 * nothing here, which matters more since guests can order: codes travel through
 * WhatsApp and screenshots, and a strip that lit up for anyone holding one
 * would be a way to watch a stranger's delivery.
 *
 * ## What it deliberately does not return
 *
 * No rider phone number — the customer is never shown one, and that rule is
 * stated in five places including the published privacy policy. No OTP: it is
 * the secret the rider checks at handover and it has no business on a banner
 * visible over every screen in the app. No address. **First name only** for the
 * rider, which is the same thing the tracking route already returns.
 *
 * A null answer is the common case and is a 200, not a 404 — most people most
 * of the time have nothing in flight, and an error status for the ordinary
 * case is how a polling client learns to ignore its own failures.
 */
export async function GET() {
  const customerId = await getCustomerId();
  const codes = await provenOrderCodes();

  if (!customerId && codes.length === 0) {
    return NextResponse.json({ order: null }, { headers: NO_STORE });
  }

  const order = await prisma.order.findFirst({
    where: customerId ? { customerId } : { orderCode: { in: codes } },
    orderBy: { createdAt: "desc" },
    select: {
      orderCode: true,
      orderStatus: true,
      customerConfirmedAt: true,
      // Everything the shared ETA needs, and nothing else about where anybody
      // is: the strip prints minutes, never coordinates.
      riderLat: true,
      riderLng: true,
      riderLocationAt: true,
      deliveryLat: true,
      deliveryLng: true,
      deliveryZone: { select: { centroidLat: true, centroidLng: true } },
      assignedRider: { select: { fullName: true } },
    },
  });

  if (!order || !isLiveOrder(order.orderStatus, order.customerConfirmedAt)) {
    return NextResponse.json({ order: null }, { headers: NO_STORE });
  }

  /*
    The arrival time, from the same function the tracking map uses.

    Falling back to the drop-off zone's centre when the exact pin never
    geocoded is the same compromise `resolveDestination` makes on the map: a
    kilometre out is useless for the last hundred metres and perfectly good for
    "how far away is he", which is the only question a strip answers.
  */
  const destination =
    order.deliveryLat != null && order.deliveryLng != null
      ? { lat: order.deliveryLat, lng: order.deliveryLng }
      : order.deliveryZone?.centroidLat != null && order.deliveryZone?.centroidLng != null
        ? { lat: order.deliveryZone.centroidLat, lng: order.deliveryZone.centroidLng }
        : null;
  const riderPoint =
    order.riderLat != null && order.riderLng != null
      ? { lat: order.riderLat, lng: order.riderLng }
      : null;

  const statusKey = CUSTOMER_STATUS_KEY[order.orderStatus];
  const payload: ActiveOrder = {
    orderCode: order.orderCode,
    statusKey,
    progress: orderProgress(CUSTOMER_TIMELINE, statusKey),
    // First name only. Never the surname, never the number, never the photo —
    // this is a strip, not the rider identity card.
    riderFirstName: order.assignedRider?.fullName?.trim().split(/\s+/)[0] ?? null,
    etaMinutes: etaMinutes(riderPoint, destination, isStalePosition(order.riderLocationAt)),
  };

  return NextResponse.json({ order: payload }, { headers: NO_STORE });
}

/*
  Never cached. This is the one thing on screen claiming to be live, and a
  proxy holding it for even thirty seconds would have it saying "collecting
  your order" while the rider is at the door.
*/
const NO_STORE = { "Cache-Control": "no-store, must-revalidate" };
