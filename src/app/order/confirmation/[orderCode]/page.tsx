import { notFound } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderConfirmation } from "@/components/customer/OrderConfirmation";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const [order, settings] = await Promise.all([
    prisma.order.findUnique({ where: { orderCode: orderCode.toUpperCase() }, include: { customer: true } }),
    getOperatingSettings(),
  ]);
  if (!order) notFound();

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderConfirmation
          order={{
            orderCode: order.orderCode,
            createdAt: order.createdAt.toISOString(),
            orderStatus: order.orderStatus,
            customerName: order.customer.fullName,
            customerWhatsapp: order.customer.whatsappNumber,
            preferredLanguage: order.customer.preferredLanguage,
            serviceType: order.serviceType,
            itemDescription: order.itemDescription,
            quantity: order.quantity,
            declaredValueXaf: order.declaredValueXaf,
            isFragile: order.isFragile,
            isMedicine: order.isMedicine,
            prescriptionRequired: order.prescriptionRequired,
            pickupLocation: order.pickupLocation,
            pickupLandmark: order.pickupLandmark,
            deliveryLocation: order.deliveryLocation,
            deliveryLandmark: order.deliveryLandmark,
            paymentMethod: order.paymentMethod,
            specialInstructions: order.specialInstructions,
            customerVisibleNotes: order.customerVisibleNotes,
            otpCode: order.otpCode,
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
