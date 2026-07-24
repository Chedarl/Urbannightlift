import { HomeContent } from "@/components/customer/HomeContent";
import { BottomNav } from "@/components/customer/BottomNav";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { getOperatingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getOperatingSettings();
  return (
    <>
      <div className="absolute right-4 top-4 z-30">
        <LanguageSwitch />
      </div>
      <main>
        <HomeContent mode={settings.mode} />
      </main>
      <BottomNav />
    </>
  );
}
