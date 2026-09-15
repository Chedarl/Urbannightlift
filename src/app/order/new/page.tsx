import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderForm } from "@/components/customer/OrderForm";
import { BottomNav } from "@/components/customer/BottomNav";
import { ServiceComingSoon } from "@/components/customer/ServiceComingSoon";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings, isServiceEnabled } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
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
  searchParams: Promise<{ service?: string }>;
}) {
  const [{ service }, settings, merchants, customerId] = await Promise.all([
    searchParams,
    getOperatingSettings(),
    // The picker shows a shortlist; the merchant autocomplete on the food and
    // medicine forms searches the whole verified catalogue.
    prisma.merchant.findMany({
      where: { verified: true, active: true, acceptingOrders: true },
      orderBy: [{ popularityRank: "desc" }, { merchantName: "asc" }],
      take: 100,
      select: { id: true, merchantName: true, category: true, address: true, neighbourhood: true, landmark: true, openingHours: true },
    }),
    getCustomerId(),
  ]);

  /*
    The gate used to stand here, and it stood in the wrong place.

    A customer arriving at `/order/new` could not see the form — not the
    restaurants, not the menu, not the price — until they had created an account
    and chosen a PIN. Baymard puts forced account creation at roughly a fifth of
    all checkout abandonment, and this was worse than the case they measured:
    the demand came *before* the person had learned anything about what they
    were buying or what it would cost.

    So they browse, build a cart and see the real figure, and the account is
    asked for at `Place order` on the review screen — where the three things it
    buys them are about to become true. `requireAccountToOrder` still governs
    that; it simply governs checkout now rather than the shop window.
  */

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
        <BottomNav signedIn={Boolean(customerId)} />
      </>
    );
  }

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderForm merchants={merchants} />
      </main>
      {/*
        No bottom nav here, deliberately.

        It was added and then taken straight back out, because the screenshot
        settled it: the form already pins a cart bar to the bottom, and a tab
        bar on the same pixels is two bars fighting for sixty of a 390px
        screen's height — the exact collision `CartBar` was written to end.

        This is a focused task, the way a merchant's menu is on Meituan: you
        came here to do one thing, the bar tells you what it costs, and the
        header's back arrow is the way out. The nav returns on the confirmation
        screen, which has no pinned bar and is somewhere you browse *from*.
      */}
    </>
  );
}
