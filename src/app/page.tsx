import { HomeContent } from "@/components/customer/HomeContent";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { getCustomerId } from "@/lib/auth/customer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, customerId] = await Promise.all([getOperatingSettings(), getCustomerId()]);
  return (
    <main>
      <HomeContent
        mode={settings.mode}
        startHour={settings.operatingStartHour}
        endHour={settings.operatingEndHour}
        enabledServices={resolveEnabledServices(settings)}
        signedIn={Boolean(customerId)}
      />
    </main>
  );
}
