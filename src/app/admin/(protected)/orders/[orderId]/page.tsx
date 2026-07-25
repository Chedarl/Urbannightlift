import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { OrderDetail } from "@/components/admin/OrderDetail";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const [order, riders, viewer, auditTrail] = await Promise.all([
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
      select: { id: true, fullName: true, zoneIds: true, isOnline: true },
      orderBy: { fullName: "asc" },
    }),
    getSessionUser(),
    // The audit trail is keyed by entity rather than related, so a log row
    // survives the order it describes.
    prisma.auditLog.findMany({
      where: { entityType: "order", entityId: orderId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  if (!order) notFound();

  // Rank riders for this specific drop-off: whether they cover the delivery
  // zone, whether they are working, and how they have actually performed there.
  // Local knowledge is what makes a landmark address findable, so a rider who
  // knows the area is worth more than the next name on a list.
  const deliveryZoneId = order.deliveryZoneId;
  const [zoneDelivered, zoneFailed] = await Promise.all([
    deliveryZoneId
      ? prisma.order.groupBy({
          by: ["assignedRiderId"],
          where: {
            deliveryZoneId,
            orderStatus: { in: ["DELIVERED", "CLOSED"] },
            assignedRiderId: { not: null },
            isTest: false,
            archivedAt: null,
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    deliveryZoneId
      ? prisma.order.groupBy({
          by: ["assignedRiderId"],
          where: {
            deliveryZoneId,
            orderStatus: "FAILED_DELIVERY",
            assignedRiderId: { not: null },
            isTest: false,
            archivedAt: null,
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const deliveredBy = new Map(zoneDelivered.map((r) => [r.assignedRiderId, r._count._all]));
  const failedBy = new Map(zoneFailed.map((r) => [r.assignedRiderId, r._count._all]));

  const riderOptions = riders
    .map((r) => {
      const done = deliveredBy.get(r.id) ?? 0;
      const failed = failedBy.get(r.id) ?? 0;
      const attempts = done + failed;
      return {
        id: r.id,
        fullName: r.fullName,
        // No zones assigned means "covers anywhere", so a new rider is never
        // filtered out of the list before they've been set up.
        coversZone: deliveryZoneId ? r.zoneIds.length === 0 || r.zoneIds.includes(deliveryZoneId) : true,
        isOnline: r.isOnline,
        zoneDeliveries: done,
        zoneSuccessRate: attempts > 0 ? Math.round((done / attempts) * 100) : null,
      };
    })
    .sort((a, b) => {
      if (a.coversZone !== b.coversZone) return a.coversZone ? -1 : 1;
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return b.zoneDeliveries - a.zoneDeliveries;
    });

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
        pickupGeoSource: order.pickupGeoSource,
        pickupGeoConfidence: order.pickupGeoConfidence,
        deliveryLocation: order.deliveryLocation,
        deliveryLandmark: order.deliveryLandmark,
        deliveryZone: order.deliveryZone?.zoneName ?? null,
        deliverySafety: order.deliveryZone?.safetyLevel ?? null,
        deliveryGeoSource: order.deliveryGeoSource,
        deliveryGeoConfidence: order.deliveryGeoConfidence,
        merchantName: order.merchant?.merchantName ?? null,
        merchantWhatsapp: order.merchant?.whatsappNumber ?? null,
        itemDescription: order.itemDescription,
        serviceDetails: (order.serviceDetails ?? null) as Record<string, unknown> | null,
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
        paymentProofUrl: order.payments[0]?.proofScreenshotUrl ?? null,
        estimatedDeliveryFeeXaf: order.estimatedDeliveryFeeXaf,
        finalDeliveryFeeXaf: order.finalDeliveryFeeXaf,
        totalAmountDueXaf: order.totalAmountDueXaf,
        riskFlag: order.riskFlag,
        highValueFlag: order.highValueFlag,
        rejectionReason: order.rejectionReason,
        adminNotes: order.adminNotes,
        customerVisibleNotes: order.customerVisibleNotes,
        assignedRiderId: order.assignedRiderId,
        quoteSentAt: order.quoteSentAt?.toISOString() ?? null,
        quoteAcceptedAt: order.quoteAcceptedAt?.toISOString() ?? null,
        quoteDeclinedAt: order.quoteDeclinedAt?.toISOString() ?? null,
        quoteDeclineReason: order.quoteDeclineReason,
        quotedFeeXaf: order.quotedFeeXaf,
        riderAcceptedAt: order.riderAcceptedAt?.toISOString() ?? null,
        riderSharePercent: order.riderSharePercent,
        riderPayoutXaf: order.riderPayoutXaf,
        companyEarningXaf: order.companyEarningXaf,
        cashCollectedXaf: order.cashCollectedXaf,
        cashSettledAt: order.cashSettledAt?.toISOString() ?? null,
        isTest: order.isTest,
        archived: order.archivedAt != null,
        customerConfirmedAt: order.customerConfirmedAt?.toISOString() ?? null,
        customerConfirmMethod: order.customerConfirmMethod,
        customerProofUrl: order.customerProofUrl,
        riderLat: order.riderLat,
        riderLng: order.riderLng,
        riderLocationAt: order.riderLocationAt?.toISOString() ?? null,
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
        auditTrail: auditTrail.map((a) => ({
          actorName: a.actorName,
          actorRole: a.actorRole,
          action: a.action,
          changes: a.changes as Record<string, { from: unknown; to: unknown }> | null,
          reason: a.reason,
          createdAt: a.createdAt.toISOString(),
        })),
      }}
      riders={riderOptions}
      isOwner={viewer?.role === "OWNER"}
    />
  );
}
