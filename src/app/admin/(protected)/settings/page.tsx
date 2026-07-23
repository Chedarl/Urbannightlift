import { getOperatingSettings } from "@/lib/settings";
import { SettingsManager } from "@/components/admin/SettingsManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getOperatingSettings();
  return (
    <SettingsManager
      settings={{
        mode: settings.mode,
        operatingStartHour: settings.operatingStartHour,
        operatingEndHour: settings.operatingEndHour,
        zoneNoticeEn: settings.zoneNoticeEn ?? "",
        zoneNoticeFr: settings.zoneNoticeFr ?? "",
      }}
    />
  );
}
