import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { HomeContent } from "@/components/customer/HomeContent";
import { getOperatingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getOperatingSettings();
  return (
    <>
      <CustomerHeader />
      <main>
        <HomeContent mode={settings.mode} />
      </main>
    </>
  );
}
