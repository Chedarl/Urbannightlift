import { prisma } from "@/lib/prisma";
import { IncidentsManager } from "@/components/admin/IncidentsManager";

export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { order: { select: { orderCode: true } } },
  });
  return (
    <IncidentsManager
      incidents={incidents.map((i) => ({
        id: i.id,
        orderCode: i.order?.orderCode ?? null,
        incidentType: i.incidentType,
        description: i.description,
        responsibleParty: i.responsibleParty,
        resolutionStatus: i.resolutionStatus,
        internalNotes: i.internalNotes,
        createdAt: i.createdAt.toISOString(),
      }))}
    />
  );
}
