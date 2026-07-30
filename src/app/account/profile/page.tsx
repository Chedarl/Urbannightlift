import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { ProfileScreen } from "@/components/customer/portal/ProfileScreen";
import { getCustomerId } from "@/lib/auth/customer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DELIVERED = ["DELIVERED", "CLOSED"];

export default async function ProfilePage() {
  const customerId = await getCustomerId();
  if (!customerId) redirect("/account/login?next=/account/profile");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { orders: { select: { orderStatus: true }, take: 200 } },
  });
  if (!customer) redirect("/account/login");

  return (
    <>
      <CustomerHeader />
      <main>
        <ProfileScreen
          customer={{
            fullName: customer.fullName,
            whatsappNumber: customer.whatsappNumber,
            nights: customer.orders.filter((o) => DELIVERED.includes(o.orderStatus)).length,
            referralCode: customer.referralCode,
            creditXaf: customer.referralCreditXaf,
          }}
        />
      </main>
      <BottomNav />
    </>
  );
}
