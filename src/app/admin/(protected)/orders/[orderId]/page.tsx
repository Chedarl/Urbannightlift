import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderDetail } from "@/components/admin/OrderDetail";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const [order, riders] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        pickupZone: true,
        deliveryZone: true,
        merchant: true,
        assignedRider: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "desc" } },
        deliveryProofs: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: { role: "RIDER", status: "ACTIVE" },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  if (!order) notFound();

  return (
    <OrderDetail
      order={{
        id: order.id,
        orderCode: order.orderCode,
        createdAt: order.createdAt.toISOString(),
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        serviceType: order.serviceType,
        customerName: order.customer.fullName,
        customerWhatsapp: order.customer.whatsappNumber,
        alternativePhone: order.customer.alternativePhone,
        preferredLanguage: order.customer.preferredLanguage,
        pickupLocation: order.pickupLocation,
        pickupLandmark: order.pickupLandmark,
        pickupZone: order.pickupZone?.zoneName ?? null,
        pickupSafety: order.pickupZone?.safetyLevel ?? null,
        deliveryLocation: order.deliveryLocation,
        deliveryLandmark: order.deliveryLandmark,
        deliveryZone: order.deliveryZone?.zoneName ?? null,
        deliverySafety: order.deliveryZone?.safetyLevel ?? null,
        merchantName: order.merchant?.merchantName ?? null,
        merchantWhatsapp: order.merchant?.whatsappNumber ?? null,
        itemDescription: order.itemDescription,
        quantity: order.quantity,
        declaredValueXaf: order.declaredValueXaf,
        isFragile: order.isFragile,
        needsTemperatureCare: order.needsTemperatureCare,
        isMedicine: order.isMedicine,
        prescriptionRequired: order.prescriptionRequired,
        itemAlreadyPaid: order.itemAlreadyPaid,
        riderPaysAtPickup: order.riderPaysAtPickup,
        preferredDeliveryTime: order.preferredDeliveryTime,
        specialInstructions: order.specialInstructions,
        paymentMethod: order.paymentMethod,
        paymentPhone: order.payments[0]?.paymentPhone ?? null,
        transactionReference: order.payments[0]?.transactionReference ?? null,
        estimatedDeliveryFeeXaf: order.estimatedDeliveryFeeXaf,
        finalDeliveryFeeXaf: order.finalDeliveryFeeXaf,
        totalAmountDueXaf: order.totalAmountDueXaf,
        riskFlag: order.riskFlag,
        highValueFlag: order.highValueFlag,
        rejectionReason: order.rejectionReason,
        adminNotes: order.adminNotes,
        customerVisibleNotes: order.customerVisibleNotes,
        assignedRiderId: order.assignedRiderId,
        otpCode: order.otpCode,
        screenshotUrl: order.screenshotUrl,
        statusHistory: order.statusHistory.map((h) => ({
          toStatus: h.toStatus,
          fromStatus: h.fromStatus,
          changedByRole: h.changedByRole,
          note: h.note,
          createdAt: h.createdAt.toISOString(),
        })),
        proofs: order.deliveryProofs.map((p) => ({
          stage: p.stage,
          otpEntered: p.otpEntered,
          photoUrl: p.photoUrl,
          riderNote: p.riderNote,
          createdAt: p.createdAt.toISOString(),
        })),
      }}
      riders={riders}
    />
  );
}
