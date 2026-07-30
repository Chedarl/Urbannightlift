import { redirect } from "next/navigation";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { ReferralScreen } from "@/components/customer/portal/ReferralScreen";
import { getCustomerId } from "@/lib/auth/customer";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { ensureReferralCode, referralBalance } from "@/lib/referrals/accrual";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const customerId = await getCustomerId();
  if (!customerId) redirect("/account/login?next=/account/referrals");

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) redirect("/account/login");

  const [code, settings, balance] = await Promise.all([
    ensureReferralCode(customerId),
    getOperatingSettings(),
    referralBalance(customerId),
  ]);

  return (
    <>
      <CustomerHeader />
      <main>
        <ReferralScreen
          code={code}
          creditXaf={balance.balanceXaf}
          rewardPercent={settings.referralRewardPercent}
          friendsBrought={balance.friendsBrought}
        />
      </main>
      <BottomNav signedIn />
    </>
  );
}
