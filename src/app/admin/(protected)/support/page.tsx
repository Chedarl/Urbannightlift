import { prisma } from "@/lib/prisma";
import { SupportRequestsManager } from "@/components/admin/SupportRequestsManager";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const requests = await prisma.supportRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
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
  );
}
