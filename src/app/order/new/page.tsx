import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderForm } from "@/components/customer/OrderForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrderFormPage() {
  const [zones, merchants] = await Promise.all([
    prisma.zone.findMany({
      where: { active: true },
      orderBy: { zoneName: "asc" },
      select: {
        id: true,
        zoneName: true,
        feeXaf: true,
        nearbyFeeXaf: true,
        extendedFeeXaf: true,
        medicineFeeXaf: true,
        nightUrgencyFeeXaf: true,
        safetyLevel: true,
      },
    }),
    prisma.merchant.findMany({
      where: { verified: true, active: true },
      orderBy: { merchantName: "asc" },
      select: {
        id: true,
        merchantName: true,
        category: true,
        address: true,
        landmark: true,
        openingHours: true,
      },
    }),
  ]);

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderForm zones={zones} merchants={merchants} />
      </main>
    </>
  );
}
