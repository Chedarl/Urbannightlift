import { prisma } from "@/lib/prisma";
import { SupportRequestsManager } from "@/components/admin/SupportRequestsManager";
import { ServiceWaitingList } from "@/components/admin/ServiceWaitingList";
import { getOperatingSettings, resolveEnabledServices } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const [requests, waiting, settings] = await Promise.all([
    prisma.supportRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.serviceInterest.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    getOperatingSettings(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <SupportRequestsManager
        requests={requests.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          whatsappNumber: r.whatsappNumber,
          email: r.email,
          orderCode: r.orderCode,
          category: r.category,
          message: r.message,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />

      <ServiceWaitingList
        enabledServices={resolveEnabledServices(settings)}
        entries={waiting.map((w) => ({
          id: w.id,
          serviceType: w.serviceType,
          whatsappNumber: w.whatsappNumber,
          createdAt: w.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
