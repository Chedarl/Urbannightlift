import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { prisma } from "@/lib/prisma";
import type { ServiceType } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, interest] = await Promise.all([
    getOperatingSettings(),
    // Waiting-list size per paused service — the demand signal shown beside each toggle.
    prisma.serviceInterest.groupBy({ by: ["serviceType"], _count: { _all: true } }),
  ]);

  const interestCounts: Partial<Record<ServiceType, number>> = {};
  for (const row of interest) interestCounts[row.serviceType] = row._count._all;

  return (
    <SettingsManager
      interestCounts={interestCounts}
      settings={{
        mode: settings.mode,
        enabledServices: resolveEnabledServices(settings),
        operatingStartHour: settings.operatingStartHour,
        operatingEndHour: settings.operatingEndHour,
        zoneNoticeEn: settings.zoneNoticeEn ?? "",
        zoneNoticeFr: settings.zoneNoticeFr ?? "",
        mtnMerchantCode: settings.mtnMerchantCode ?? "",
        mtnUssdTemplate: settings.mtnUssdTemplate ?? "",
        orangeMerchantCode: settings.orangeMerchantCode ?? "",
        orangeUssdTemplate: settings.orangeUssdTemplate ?? "",
        riderSharePercent: settings.riderSharePercent,
        testMode: settings.testMode,
      }}
    />
  );
}
