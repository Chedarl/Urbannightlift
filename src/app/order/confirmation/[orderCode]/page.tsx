import { notFound } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderConfirmation } from "@/components/customer/OrderConfirmation";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { getCustomerId } from "@/lib/auth/customer";

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
    prisma.order.findUnique({ where: { orderCode: orderCode.toUpperCase() }, include: { customer: true, pickupZone: true, deliveryZone: true } }),
    getOperatingSettings(),
    hasOrderAccess(orderCode),
    getCustomerId(),
  ]);
  if (!order) notFound();

  // An order code travels through WhatsApp, PDFs and screenshots, so it is not
  // a credential. Until the visitor proves ownership we withhold the delivery
  // OTP and the personal details, and show a verification prompt instead.
  const redact = <T,>(value: T): T | null => (verified ? value : null);

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
            paymentMethod: order.paymentMethod,
            specialInstructions: redact(order.specialInstructions),
            customerVisibleNotes: order.customerVisibleNotes,
            otpCode: redact(order.otpCode),
            quoteSentAt: order.quoteSentAt?.toISOString() ?? null,
            quoteAcceptedAt: order.quoteAcceptedAt?.toISOString() ?? null,
            quoteDeclinedAt: order.quoteDeclinedAt?.toISOString() ?? null,
            quotedFeeXaf: order.quotedFeeXaf,
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
