import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { AccountDashboard } from "@/components/customer/account/AccountDashboard";
import { getCustomerId } from "@/lib/auth/customer";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customerId = await getCustomerId();
  if (!customerId) redirect("/account/login?next=/account");

  const [customer, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    }),
    getOperatingSettings(),
  ]);

  // Session cookie outlived the row (e.g. dedupe merge) — start clean.
  if (!customer) redirect("/account/login");

  const enabled = resolveEnabledServices(settings);
  const lifetimeFeesXaf = customer.orders.reduce(
    (sum, o) => sum + (o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf ?? 0),
    0
  );

  return (
    <>
      <CustomerHeader />
      <main>
        <AccountDashboard
          customer={{
            fullName: customer.fullName,
            whatsappNumber: customer.whatsappNumber,
            preferredLanguage: customer.preferredLanguage,
            orderCount: customer.orders.length,
            lifetimeFeesXaf,
          }}
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
            // Don't offer reorder for a service that's since been paused.
            canReorder: enabled.includes(o.serviceType),
          }))}
        />
      </main>
      <BottomNav />
    </>
  );
}
