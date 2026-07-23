import { prisma } from "@/lib/prisma";
import { MerchantsManager } from "@/components/admin/MerchantsManager";

export const dynamic = "force-dynamic";

export default async function MerchantsPage() {
  const merchants = await prisma.merchant.findMany({ orderBy: { merchantName: "asc" } });
  return (
    <MerchantsManager
      merchants={merchants.map((m) => ({
        id: m.id,
        merchantName: m.merchantName,
        category: m.category,
        whatsappNumber: m.whatsappNumber,
        phone: m.phone,
        address: m.address,
        landmark: m.landmark,
        openingHours: m.openingHours,
        notes: m.notes,
        verified: m.verified,
        active: m.active,
      }))}
    />
  );
}
