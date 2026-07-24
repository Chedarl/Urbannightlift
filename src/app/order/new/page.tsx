import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { OrderForm } from "@/components/customer/OrderForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrderFormPage() {
  const merchants = await prisma.merchant.findMany({
    where: { verified: true, active: true },
    orderBy: { merchantName: "asc" },
    select: { id: true, merchantName: true, category: true, address: true, landmark: true, openingHours: true },
  });

  return (
    <>
      <CustomerHeader />
      <main>
        <OrderForm merchants={merchants} />
      </main>
    </>
  );
}
