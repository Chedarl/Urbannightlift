import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth/session";
import { ZonesManager } from "@/components/admin/ZonesManager";

export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  const user = await requireRole(ADMIN_ROLES);
  const zones = await prisma.zone.findMany({ orderBy: { zoneName: "asc" } });
  return (
    <ZonesManager
      isOwner={user?.role === "OWNER"}
      zones={zones.map((z) => ({
        id: z.id,
        zoneName: z.zoneName,
        description: z.description,
        feeXaf: z.feeXaf,
        nearbyFeeXaf: z.nearbyFeeXaf,
        extendedFeeXaf: z.extendedFeeXaf,
        nightUrgencyFeeXaf: z.nightUrgencyFeeXaf,
        medicineFeeXaf: z.medicineFeeXaf,
        waitingFeeXaf: z.waitingFeeXaf,
        safetyLevel: z.safetyLevel,
        active: z.active,
        notes: z.notes,
      }))}
    />
  );
}
