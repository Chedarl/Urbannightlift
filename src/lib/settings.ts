import { prisma } from "@/lib/prisma";
import type { OperatingSettings, ServiceType } from "@prisma/client";

/**
 * Services offered when nothing has been configured yet. Urgent item pickup,
 * Custom errand and Verified merchant delivery start on hold — the owner turns
 * them on from admin Settings as demand justifies it.
 */
export const DEFAULT_ENABLED_SERVICES: ServiceType[] = [
  "MEDICINE_PICKUP",
  "FOOD_PICKUP",
  "GROCERY_PICKUP",
  "SMALL_PARCEL",
];

/** Always returns the singleton settings row (creates the default if missing). */
export async function getOperatingSettings(): Promise<OperatingSettings> {
  const existing = await prisma.operatingSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.operatingSettings.create({
    data: {
      id: 1,
      mode: "CLOSED",
      operatingStartHour: 18,
      operatingEndHour: 4,
      zoneNoticeEn: "Currently serving selected areas in Yaoundé.",
      zoneNoticeFr: "Actuellement disponible dans certains quartiers de Yaoundé.",
      enabledServices: DEFAULT_ENABLED_SERVICES,
    },
  });
}

/**
 * The services customers may order right now. An empty column is treated as
 * "not configured" and falls back to the defaults, so a fresh database is never
 * accidentally left with every service switched off.
 */
export function resolveEnabledServices(settings: {
  enabledServices: ServiceType[];
}): ServiceType[] {
  return settings.enabledServices.length > 0 ? settings.enabledServices : DEFAULT_ENABLED_SERVICES;
}

export function isServiceEnabled(
  settings: { enabledServices: ServiceType[] },
  serviceType: ServiceType
): boolean {
  return resolveEnabledServices(settings).includes(serviceType);
}
