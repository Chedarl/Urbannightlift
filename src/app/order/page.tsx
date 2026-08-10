import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { OrderGate } from "@/components/customer/OrderGate";
import { ServiceSelection } from "@/components/customer/ServiceSelection";
import { intakeConfigured } from "@/lib/ai/intake";
import { getOperatingSettings } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { serverIsFrench } from "@/lib/i18n/server";

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
 */
export default async function ServiceSelectionPage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);

  if (settings.requireAccountToOrder && !customerId) {
    return <OrderGate next="/order" fr={await serverIsFrench()} />;
  }

  return (
    <>
      <CustomerHeader />
      <main>
        {/* Which services run tonight is a setting, not a constant — a paused
            one shows as "coming soon" rather than vanishing. */}
        <ServiceSelection enabledServices={settings.enabledServices} intakeEnabled={intakeConfigured()} />
      </main>
      <BottomNav signedIn={Boolean(customerId)} />
    </>
  );
}
