import { NextRequest, NextResponse } from "next/server";
import { riderTipShareXaf, tipCustody } from "@/lib/orders/tip";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { splitEarnings } from "@/lib/orders/earnings";
import { isShoppingService, orderMoney } from "@/lib/orders/goodsMoney";

export const dynamic = "force-dynamic";

/**
 * GET /api/rider/jobs/[orderId] — one job, in full.
 *
 * The same payload the web `RiderOrderView` is given, so the native app and the
 * website show a rider the same job. Ownership is checked the way the web page
 * checks it — `assignedRiderId` must be them — because an order id is guessable
 * enough that "signed in as a rider" is not sufficient to read a customer's
 * address and phone number.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "RIDER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await ctx.params;
  const [order, settings] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        pickupZone: true,
        deliveryZone: true,
        merchant: true,
        deliveryProofs: { orderBy: { createdAt: "asc" } },
      },
    }),
    getOperatingSettings(),
  ]);

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.assignedRiderId !== user.id) {
    return NextResponse.json({ error: "Not your order" }, { status: 403 });
  }

  const fee = order.finalDeliveryFeeXaf ?? order.quotedFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0;
  const money = orderMoney({
    serviceType: order.serviceType,
    deliveryFeeXaf: fee,
    goodsCapXaf: order.goodsCapXaf,
    goodsActualXaf: order.goodsActualXaf,
    overCapApprovedXaf: order.overCapApprovedXaf,
    tipXaf: order.tipXaf,
  });

  return NextResponse.json({
    job: {
      id: order.id,
      orderCode: order.orderCode,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      serviceType: order.serviceType,
      customerName: order.customer.fullName,
      customerWhatsapp: order.customer.whatsappNumber,
      pickup: {
        text: order.pickupLocation,
        landmark: order.pickupLandmark,
        lat: order.pickupLat,
        lng: order.pickupLng,
      },
      delivery: {
        text: order.deliveryLocation,
        landmark: order.deliveryLandmark,
        lat: order.deliveryLat,
        lng: order.deliveryLng,
      },
      itemDescription: order.itemDescription,
      quantity: order.quantity,
      declaredValueXaf: order.declaredValueXaf,
      specialInstructions: order.specialInstructions,
      preferredDeliveryTime: order.preferredDeliveryTime,
      riderPaysAtPickup: order.riderPaysAtPickup,
      merchantName: order.merchant?.merchantName ?? null,
      merchantPhone:
        order.merchant?.whatsappNumber?.trim() || order.merchant?.phone?.trim() || null,
      // A zone flagged anything other than safe is the first thing a rider
      // should read, not something buried under the item description.
      safetyNotes:
        [order.pickupZone, order.deliveryZone]
          .filter((z) => z && z.safetyLevel !== "SAFE")
          .map((z) => `${z!.zoneName}: ${z!.safetyLevel}${z!.notes ? ` — ${z!.notes}` : ""}`)
          .join(" · ") || null,
      assignedAt: order.assignedAt?.toISOString() ?? null,
      acceptedAt: order.riderAcceptedAt?.toISOString() ?? null,
      hasPickupProof: order.deliveryProofs.some((p) => p.stage === "PICKUP"),
      hasDeliveryProof: order.deliveryProofs.some(
        (p) => p.stage === "DELIVERY" && (p.otpEntered || p.photoUrl)
      ),
      payoutXaf:
        order.riderPayoutXaf ??
        (fee > 0 ? splitEarnings(fee, settings.riderSharePercent).riderPayoutXaf : null),
      payoutIsEstimate: order.riderPayoutXaf == null,
      /*
        The tip, told to the rider on the job rather than discovered at
        settlement.

        `custody` is what they actually need. On a cash order the tip is inside
        the figure they collect at the door, so a rider who does not know it is
        there will hand the whole lot back and be short by exactly the amount
        somebody meant them to have. On mobile money it is already with us and
        appears in their balance. Two different facts, so two different words.
      */
      tip: {
        xaf: riderTipShareXaf(order.tipXaf ?? 0),
        custody: tipCustody(order.tipXaf ?? 0, order.paymentMethod),
      },
      shopping: {
        isShopping: isShoppingService(order.serviceType),
        capXaf: order.goodsCapXaf,
        actualXaf: order.goodsActualXaf,
        // What the customer owes at the door, computed by the one module every
        // screen and the receipt already share.
        totalXaf: money.totalXaf,
        totalIsCeiling: money.totalIsCeiling,
        needsCustomerApproval: money.needsCustomerApproval,
      },
    },
  });
}
