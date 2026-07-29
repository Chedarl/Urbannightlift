import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { ServiceSelection } from "@/components/customer/ServiceSelection";
import { BottomNav } from "@/components/customer/BottomNav";
import { OrderGate } from "@/components/customer/OrderGate";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";
import { serverIsFrench } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ServiceSelectionPage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);

  if (settings.requireAccountToOrder && !customerId) {
    return <OrderGate next="/order" fr={await serverIsFrench()} />;
  }

  return (
    <>
      <CustomerHeader />
      <main>
        <ServiceSelection enabledServices={resolveEnabledServices(settings)} />
      </main>
      <BottomNav />
    </>
  );
}
