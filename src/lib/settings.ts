import { prisma } from "@/lib/prisma";
import type { OperatingSettings } from "@prisma/client";

/** Always returns the singleton settings row (creates the default if missing). */
export async function getOperatingSettings(): Promise<OperatingSettings> {
  const existing = await prisma.operatingSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.operatingSettings.create({
    data: {
      id: 1,
      mode: "CLOSED",
      operatingStartHour: 20,
      operatingEndHour: 24,
      zoneNoticeEn: "Currently serving selected areas in Yaoundé 6.",
      zoneNoticeFr: "Actuellement disponible dans certains quartiers de Yaoundé 6.",
    },
  });
}
