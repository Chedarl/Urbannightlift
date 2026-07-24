import { HomeContent } from "@/components/customer/HomeContent";
import { getOperatingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getOperatingSettings();
  return (
    <main>
      <HomeContent mode={settings.mode} />
    </main>
  );
}
