import { notFound, redirect } from "next/navigation";
import { riderTipShareXaf, tipCustody } from "@/lib/orders/tip";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { splitEarnings } from "@/lib/orders/earnings";
import { isShoppingService } from "@/lib/orders/goodsMoney";
import { RiderOrderView } from "@/components/rider/RiderOrderView";

export const dynamic = "force-dynamic";

export default async function RiderOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const rider = await requireRole(["RIDER"]);
  if (!rider) redirect("/rider/login");

  const { orderId } = await params;
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

  // Riders can only view their own assigned orders.
  if (!order) notFound();
  if (order.assignedRiderId !== rider.id) redirect("/rider/dashboard");

  // Before delivery there is no frozen figure yet, so show the rider what the
  // job is currently worth — nobody should accept work without knowing that.
  const fee = order.finalDeliveryFeeXaf ?? order.quotedFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0;
  const estimatedPayoutXaf = fee > 0 ? splitEarnings(fee, settings.riderSharePercent).riderPayoutXaf : null;

  return (
    <RiderOrderView
      order={{
        id: order.id,
        orderCode: order.orderCode,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        serviceType: order.serviceType,
        customerName: order.customer.fullName,
        customerWhatsapp: order.customer.whatsappNumber,
        pickupLocation: order.pickupLocation,
        pickupLandmark: order.pickupLandmark,
        pickupLat: order.pickupLat,
        pickupLng: order.pickupLng,
        deliveryLat: order.deliveryLat,
        deliveryLng: order.deliveryLng,
        deliveryLocation: order.deliveryLocation,
        deliveryLandmark: order.deliveryLandmark,
        itemDescription: order.itemDescription,
        quantity: order.quantity,
        declaredValueXaf: order.declaredValueXaf,
        merchantName: order.merchant?.merchantName ?? null,
        // Imported merchants often have only a landline in `phone`; an empty
        // whatsappNumber would otherwise render a dead "call the vendor" link.
        merchantWhatsapp:
          order.merchant?.whatsappNumber?.trim() || order.merchant?.phone?.trim() || null,
        specialInstructions: order.specialInstructions,
        preferredDeliveryTime: order.preferredDeliveryTime,
        riderPaysAtPickup: order.riderPaysAtPickup,
        safetyNotes:
          [order.pickupZone, order.deliveryZone]
            .filter((z) => z && z.safetyLevel !== "SAFE")
            .map((z) => `${z!.zoneName}: ${z!.safetyLevel}${z!.notes ? ` — ${z!.notes}` : ""}`)
            .join(" · ") || null,
        hasPickupProof: order.deliveryProofs.some((p) => p.stage === "PICKUP"),
        hasDeliveryProof: order.deliveryProofs.some(
          (p) => p.stage === "DELIVERY" && (p.otpEntered || p.photoUrl)
        ),
        assignedAt: order.assignedAt?.toISOString() ?? null,
        riderAcceptedAt: order.riderAcceptedAt?.toISOString() ?? null,
        riderPayoutXaf: order.riderPayoutXaf,
        estimatedPayoutXaf,
        tipXaf: riderTipShareXaf(order.tipXaf ?? 0),
        tipCustody: tipCustody(order.tipXaf ?? 0, order.paymentMethod),
        // Shopping services need the rider to record what the shop charged.
        isShopping: isShoppingService(order.serviceType),
        goodsCapXaf: order.goodsCapXaf,
        goodsActualXaf: order.goodsActualXaf,
      }}
    />
  );
}
