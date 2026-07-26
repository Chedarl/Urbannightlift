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
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
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
          orderId: r.orderId,
          assignedToName: null,
          // The customer spoke last, so nobody has answered them yet. This is
          // the queue that actually matters — "new" only counts arrivals.
          // Falls back to createdAt: a request stored before the thread
          // existed has no lastCustomerMessageAt, and an unanswered question
          // must never drop out of the queue because of a missing timestamp.
          waitingOnUs: (() => {
            if (r.status === "RESOLVED") return false;
            const asked = r.lastCustomerMessageAt ?? r.createdAt;
            return r.lastStaffMessageAt == null || r.lastStaffMessageAt < asked;
          })(),
          messages: r.messages.map((m) => ({
            body: m.body,
            authorType: m.authorType,
            authorName: m.authorName,
            internal: m.internal,
            createdAt: m.createdAt.toISOString(),
          })),
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
