import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderForm } from "@/components/customer/OrderForm";
import { ServiceComingSoon } from "@/components/customer/ServiceComingSoon";
import { OrderGate } from "@/components/customer/OrderGate";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings, isServiceEnabled } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { serverIsFrench } from "@/lib/i18n/server";
import type { ServiceType } from "@prisma/client";

export const dynamic = "force-dynamic";

const ALL_SERVICES: ServiceType[] = [
  "FOOD_PICKUP",
  "MEDICINE_PICKUP",
  "GROCERY_PICKUP",
  "SMALL_PARCEL",
  "URGENT_ITEM",
  "CUSTOM_ERRAND",
  "MERCHANT_DELIVERY",
];

export default async function OrderFormPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; from?: string }>;
}) {
  const [{ service, from }, settings, merchants, customerId] = await Promise.all([
    searchParams,
    getOperatingSettings(),
    // The picker shows a shortlist; the merchant autocomplete on the food and
    // medicine forms searches the whole verified catalogue.
    prisma.merchant.findMany({
      where: { verified: true, active: true, acceptingOrders: true },
      orderBy: [{ popularityRank: "desc" }, { merchantName: "asc" }],
      take: 100,
      select: { id: true, merchantName: true, category: true, address: true, landmark: true, openingHours: true },
    }),
    getCustomerId(),
  ]);

  // Account-first: nobody fills in an order they cannot place. The gate carries
  // them back here the moment they are signed in.
  if (settings.requireAccountToOrder && !customerId) {
    // `from` travels with them. Without it the intake marker is lost at the
    // sign-in door, and somebody who typed a sentence, signed in, and came back
    // would find the blank form this whole change exists to stop.
    const params = new URLSearchParams();
    if (service) params.set("service", service);
    if (from) params.set("from", from);
    const query = params.toString();
    const next = query ? `/order/new?${query}` : "/order/new";
    return <OrderGate next={next} fr={await serverIsFrench()} />;
  }

  // Guard deep links and shared URLs: a paused service must not render a form
  // the customer can fill in and then have rejected on submit.
  const requested = ALL_SERVICES.find((s) => s === service);
  if (requested && !isServiceEnabled(settings, requested)) {
    return (
      <>
        <CustomerHeader />
        <main>
          <ServiceComingSoon serviceType={requested} />
        </main>
      </>
    );
  }

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderForm merchants={merchants} />
      </main>
    </>
  );
}
