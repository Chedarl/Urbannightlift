import { notFound } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderConfirmation } from "@/components/customer/OrderConfirmation";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { getCustomerId } from "@/lib/auth/customer";
import { CUSTOMER_STATUS_KEY, CUSTOMER_TIMELINE } from "@/lib/orders/statusLabels";

export const dynamic = "force-dynamic";

/** Shows only the last two digits: "237 6XX XXX X04". */
function maskPhone(phone: string): string {
  const tail = phone.slice(-2);
  return `${"•".repeat(Math.max(0, phone.length - 2))}${tail}`;
}

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const [order, settings, verified, customerId] = await Promise.all([
    prisma.order.findUnique({
      where: { orderCode: orderCode.toUpperCase() },
      include: {
        customer: true,
        pickupZone: true,
        deliveryZone: true,
        assignedRider: { select: { fullName: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        statusHistory: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    getOperatingSettings(),
    hasOrderAccess(orderCode),
    getCustomerId(),
  ]);
  if (!order) notFound();

  // An order code travels through WhatsApp, PDFs and screenshots, so it is not
  // a credential. Until the visitor proves ownership we withhold the delivery
  // OTP and the personal details, and show a verification prompt instead.
  const redact = <T,>(value: T): T | null => (verified ? value : null);

  // Rendered server-side so the timeline is already correct on first paint;
  // the client then keeps it ticking without a reload.
  const reachedAt: Record<string, string> = {};
  for (const h of order.statusHistory) {
    const key = CUSTOMER_STATUS_KEY[h.toStatus];
    if (key && !reachedAt[key]) reachedAt[key] = h.createdAt.toISOString();
  }
  const currentKey = CUSTOMER_STATUS_KEY[order.orderStatus];
  const currentIndex = CUSTOMER_TIMELINE.indexOf(currentKey);
  const steps = CUSTOMER_TIMELINE.map((key, i) => ({
    key,
    done: currentIndex >= 0 && i < currentIndex,
    current: key === currentKey,
    at: reachedAt[key] ?? null,
  }));

  const payment = order.payments[0] ?? null;

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderConfirmation
          offerAccount={!customerId}
          order={{
            orderCode: order.orderCode,
            createdAt: order.createdAt.toISOString(),
            orderStatus: order.orderStatus,
            verified,
            customerName: verified ? order.customer.fullName : "",
            customerWhatsapp: verified
              ? order.customer.whatsappNumber
              : maskPhone(order.customer.whatsappNumber),
            totalOrders: order.customer.totalOrders,
            preferredLanguage: order.customer.preferredLanguage,
            serviceType: order.serviceType,
            itemDescription: verified ? order.itemDescription : "",
            serviceDetails: verified
              ? ((order.serviceDetails ?? null) as Record<string, unknown> | null)
              : null,
            estimatedFeeXaf: order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? null,
            pickupZoneName: order.pickupZone?.zoneName ?? null,
            deliveryZoneName: order.deliveryZone?.zoneName ?? null,
            quantity: order.quantity,
            declaredValueXaf: order.declaredValueXaf,
            isFragile: order.isFragile,
            isMedicine: order.isMedicine,
            prescriptionRequired: order.prescriptionRequired,
            pickupLocation: verified ? order.pickupLocation : "",
            pickupLandmark: redact(order.pickupLandmark),
            deliveryLocation: verified ? order.deliveryLocation : "",
            deliveryLandmark: redact(order.deliveryLandmark),
            deliveryLat: verified ? order.deliveryLat : null,
            deliveryLng: verified ? order.deliveryLng : null,
            paymentMethod: order.paymentMethod,
            specialInstructions: redact(order.specialInstructions),
            customerVisibleNotes: order.customerVisibleNotes,
            otpCode: redact(order.otpCode),
            quoteSentAt: order.quoteSentAt?.toISOString() ?? null,
            quoteAcceptedAt: order.quoteAcceptedAt?.toISOString() ?? null,
            quoteDeclinedAt: order.quoteDeclinedAt?.toISOString() ?? null,
            quotedFeeXaf: order.quotedFeeXaf,
            customerConfirmedAt: order.customerConfirmedAt?.toISOString() ?? null,
            customerConfirmMethod: order.customerConfirmMethod,
            steps,
            deliveredAt: order.completedAt?.toISOString() ?? null,
            riderName: order.assignedRider?.fullName ?? null,
            ratingStars: order.ratingStars,
            amountPaidXaf: order.finalDeliveryFeeXaf ?? order.quotedFeeXaf ?? order.estimatedDeliveryFeeXaf ?? null,
            paymentReference: redact(payment?.transactionReference ?? null),
            paymentVerifiedAt: payment?.verifiedAt?.toISOString() ?? null,
          }}
          payment={{
            orderCode: order.orderCode,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            amountXaf: order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? null,
            mtnMerchantCode: settings.mtnMerchantCode,
            mtnUssdTemplate: settings.mtnUssdTemplate,
            orangeMerchantCode: settings.orangeMerchantCode,
            orangeUssdTemplate: settings.orangeUssdTemplate,
          }}
        />
      </main>
    </>
  );
}
