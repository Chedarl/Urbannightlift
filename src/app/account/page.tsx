import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { PortalHome } from "@/components/customer/portal/PortalHome";
import { getCustomerId } from "@/lib/auth/customer";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { activeOrder, completedNights, favoriteService, primaryIntent } from "@/lib/account/personalize";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customerId = await getCustomerId();
  if (!customerId) redirect("/account/login?next=/account");

  const [customer, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 50 },
        addresses: { orderBy: { createdAt: "desc" }, take: 8 },
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
  const active = activeOrder(customer.orders);

  return (
    <>
      <CustomerHeader />
      <main>
        <PortalHome
          data={{
            customer: {
              fullName: customer.fullName,
              whatsappNumber: customer.whatsappNumber,
              preferredLanguage: customer.preferredLanguage,
              nights: completedNights(customer.orders),
              lifetimeFeesXaf,
              referralCode: customer.referralCode,
              creditXaf: customer.referralCreditXaf,
            },
            enabledServices: enabled,
            favoriteService: favoriteService(customer.orders),
            activeOrderCode: active?.orderCode ?? null,
            intent: primaryIntent(customer.orders),
            orders: customer.orders.map((o) => ({
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
            })),
            addresses: customer.addresses.map((a) => ({
              id: a.id,
              label: a.label,
              locationText: a.locationText,
              landmark: a.landmark,
              lat: a.lat,
              lng: a.lng,
              zoneId: a.zoneId,
            })),
          }}
        />
      </main>
      <BottomNav />
    </>
  );
}
