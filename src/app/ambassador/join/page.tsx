import { prisma } from "@/lib/prisma";
import { AmbassadorJoinForm } from "@/components/ambassador/AmbassadorJoinForm";
import { DEFAULT_TERMS } from "@/lib/ambassadors/rules";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Become an ambassador — Urban Night Lift",
  description: "Share your code, earn on every night delivery your people take.",
};

/**
 * The terms shown here are read from settings rather than hardcoded, so what an
 * applicant is promised is the same figure the accounting actually uses.
 */
export default async function AmbassadorJoinPage() {
  const settings = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: {
      referralDiscountXaf: true,
      ambassadorCommissionPercent: true,
      ambassadorCommissionOrderCap: true,
    },
  });

  return (
    <AmbassadorJoinForm
      fr={false}
      terms={{
        discountXaf: settings?.referralDiscountXaf ?? DEFAULT_TERMS.discountXaf,
        commissionPercent: settings?.ambassadorCommissionPercent ?? DEFAULT_TERMS.commissionPercent,
        orderCap: settings?.ambassadorCommissionOrderCap ?? DEFAULT_TERMS.orderCap,
      }}
    />
  );
}
