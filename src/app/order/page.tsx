import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { ServiceSelection } from "@/components/customer/ServiceSelection";
import { intakeConfigured } from "@/lib/ai/intake";
import { getOperatingSettings } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { prisma } from "@/lib/prisma";
import { eligibleForLaunchOffer } from "@/lib/orders/launchOffer";

export const dynamic = "force-dynamic";

/**
 * Choose a service.
 *
 * This page rendered `<FoodForm />` directly, so tapping **Order** went straight
 * to food and there was no way to reach medicine, groceries or a parcel from the
 * bottom nav at all. The function was still named `ServiceSelectionPage` and
 * `ServiceSelection.tsx` was still in the tree with no importer left — the tell
 * that the picker had been replaced rather than deliberately removed.
 *
 * Four services are live, each with its own bespoke form. The picker is what
 * connects the nav to them, and it also handles a paused service properly:
 * those open the "notify me" sheet instead of a form that would refuse to
 * submit.
 *
 * ## The gate is gone from here too
 *
 * This page returned `<OrderGate>` for anybody not signed in, so tapping
 * **Order** in the nav hit a wall before a single service was visible. That is
 * the shop window boarded up: the decision was that people browse, build an
 * order and see the real price without an account, and the gate stands at
 * checkout where the three things an account buys are about to become true.
 * `requireAccountToOrder` still governs — it now governs placing an order
 * rather than looking at one.
 *
 * `OrderGate.tsx` is deleted rather than left unimported. Its three promises —
 * your orders in one place, your addresses remembered, a link that lets
 * somebody watch you home — now live inline on the review screen, where they
 * are about to become true instead of being made to a stranger. A component
 * with no importers is how a wall gets quietly put back.
 */
export default async function ServiceSelectionPage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);

  /*
    Whether this person's first delivery is on us, decided here.

    A guest has completed nothing, so they qualify — which is the point: the
    offer exists to get somebody who has never used this to try it once, and
    requiring them to sign in before being told about it puts the toll back in
    front of the reason to pay it.
  */
  const completedOrders = customerId
    ? await prisma.order.count({ where: { customerId, orderStatus: "DELIVERED" } })
    : 0;
  const capXaf = settings.firstOrderFreeCapXaf ?? 0;

  return (
    <>
      <CustomerHeader />
      <main>
        {/* Which services run tonight is a setting, not a constant — a paused
            one shows as "coming soon" rather than vanishing. */}
        <ServiceSelection
          enabledServices={settings.enabledServices}
          intakeEnabled={intakeConfigured()}
          firstOrderFreeCapXaf={eligibleForLaunchOffer(completedOrders, capXaf) ? capXaf : 0}
        />
      </main>
      <BottomNav signedIn={Boolean(customerId)} />
    </>
  );
}
