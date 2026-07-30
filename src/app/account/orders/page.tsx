import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { OrderHistory } from "@/components/customer/portal/OrderHistory";
import { getCustomerId } from "@/lib/auth/customer";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const customerId = await getCustomerId();
  if (!customerId) redirect("/account/login?next=/account/orders");

  const [customer, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: { orders: { orderBy: { createdAt: "desc" }, take: 100 } },
    }),
    getOperatingSettings(),
  ]);
  if (!customer) redirect("/account/login");
  const enabled = resolveEnabledServices(settings);

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderHistory
          customer={{ fullName: customer.fullName, whatsappNumber: customer.whatsappNumber, preferredLanguage: customer.preferredLanguage }}
          orders={customer.orders.map((o) => ({
            orderCode: o.orderCode,
            createdAt: o.createdAt.toISOString(),
            orderStatus: o.orderStatus,
            serviceType: o.serviceType,
            itemDescription: o.itemDescription,
            quantity: o.quantity,
            declaredValueXaf: o.declaredValueXaf,
            feeXaf: o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf ?? null,
            pickupLocation: o.pickupLocation,
            pickupLandmark: o.pickupLandmark,
            deliveryLocation: o.deliveryLocation,
            deliveryLandmark: o.deliveryLandmark,
            paymentMethod: o.paymentMethod,
            serviceDetails: (o.serviceDetails ?? null) as Record<string, unknown> | null,
            canReorder: enabled.includes(o.serviceType),
          }))}
        />
      </main>
      <BottomNav signedIn />
    </>
  );
}
