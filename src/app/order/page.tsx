import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { ServiceSelection } from "@/components/customer/ServiceSelection";
import { BottomNav } from "@/components/customer/BottomNav";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ServiceSelectionPage() {
  const settings = await getOperatingSettings();
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
