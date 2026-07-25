import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_STATUS_KEY, CUSTOMER_TIMELINE } from "@/lib/orders/statusLabels";

/**
 * GET /api/track/[orderCode] — public live snapshot for the customer's
 * tracking screen: which steps are done and when, plus coordinates for the map.
 *
 * The timeline used to be rendered once on the server behind a manual "Refresh
 * status" button, so a customer watching their order saw nothing change until
 * they thought to tap it. This is what lets each step tick itself off as it
 * actually happens.
 *
 * Order codes are unguessable and nothing returned here is a credential — no
 * OTP, no contact details, no addresses. Everything private stays behind the
 * ownership check on the page itself.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  const order = await prisma.order.findUnique({
    where: { orderCode: orderCode.toUpperCase() },
    select: {
      orderStatus: true,
      pickupLat: true,
      pickupLng: true,
      deliveryLat: true,
      deliveryLng: true,
      riderLat: true,
      riderLng: true,
      riderLocationAt: true,
      customerConfirmedAt: true,
      customerConfirmMethod: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      statusHistory: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return NextResponse.json({ found: false }, { status: 404 });

  // When each customer-visible step was first reached. Several underlying
  // statuses map to one customer step (both "going to pickup" and "arrived at
  // pickup" are simply "pickup"), so the earliest wins.
  const reachedAt: Record<string, string> = {};
  for (const h of order.statusHistory) {
    const key = CUSTOMER_STATUS_KEY[h.toStatus];
    if (key && !reachedAt[key]) reachedAt[key] = h.createdAt.toISOString();
  }

  const currentKey = CUSTOMER_STATUS_KEY[order.orderStatus];
  const currentIndex = CUSTOMER_TIMELINE.indexOf(currentKey);

  // Everything before the current step counts as done even where no history
  // row exists for it: a customer must never see a later step ticked while an
  // earlier one still looks pending.
  const steps = CUSTOMER_TIMELINE.map((key, i) => ({
    key,
    done: currentIndex >= 0 && i < currentIndex,
    current: key === currentKey,
    at: reachedAt[key] ?? null,
  }));

  return NextResponse.json({
    found: true,
    statusKey: currentKey,
    steps,
    // The last step is only truly finished once the customer says it is.
    customerConfirmedAt: order.customerConfirmedAt,
    customerConfirmMethod: order.customerConfirmMethod,
    awaitingQuote: order.quoteSentAt != null && order.quoteAcceptedAt == null,
    pickup: order.pickupLat != null && order.pickupLng != null ? { lat: order.pickupLat, lng: order.pickupLng } : null,
    delivery:
      order.deliveryLat != null && order.deliveryLng != null
        ? { lat: order.deliveryLat, lng: order.deliveryLng }
        : null,
    rider:
      order.riderLat != null && order.riderLng != null
        ? { lat: order.riderLat, lng: order.riderLng, at: order.riderLocationAt }
        : null,
  });
}
