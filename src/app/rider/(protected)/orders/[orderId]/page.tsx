import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
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
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      pickupZone: true,
      deliveryZone: true,
      merchant: true,
      deliveryProofs: { orderBy: { createdAt: "asc" } },
    },
  });

  // Riders can only view their own assigned orders.
  if (!order) notFound();
  if (order.assignedRiderId !== rider.id) redirect("/rider/dashboard");

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
        deliveryLocation: order.deliveryLocation,
        deliveryLandmark: order.deliveryLandmark,
        itemDescription: order.itemDescription,
        quantity: order.quantity,
        declaredValueXaf: order.declaredValueXaf,
        merchantName: order.merchant?.merchantName ?? null,
        merchantWhatsapp: order.merchant?.whatsappNumber ?? null,
        specialInstructions: order.specialInstructions,
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
      }}
    />
  );
}
