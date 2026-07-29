import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAmbassador } from "@/lib/auth/ambassador";
import { ambassadorBalance } from "@/lib/ambassadors/accrual";
import { AmbassadorDashboard } from "@/components/ambassador/AmbassadorDashboard";
import { DEFAULT_TERMS } from "@/lib/ambassadors/rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your ambassador earnings — Urban Night Lift" };

/**
 * What an ambassador has actually earned.
 *
 * Everything shown is derived from the ledger rather than a stored total, so
 * the number here and the number the owner pays from are the same number. The
 * fastest way to lose somebody promoting you is a balance that quietly
 * disagrees with what lands on their phone.
 */
export default async function AmbassadorDashboardPage() {
  const ambassador = await getCurrentAmbassador();
  if (!ambassador) redirect("/ambassador/login");

  const [balance, settings, customers, orders, ledger] = await Promise.all([
    ambassadorBalance(ambassador.id),
    prisma.operatingSettings.findUnique({
      where: { id: 1 },
      select: {
        referralDiscountXaf: true,
        ambassadorCommissionPercent: true,
        ambassadorCommissionOrderCap: true,
      },
    }),
    prisma.customer.count({ where: { referredByAmbassadorId: ambassador.id } }),
    prisma.order.findMany({
      where: { ambassadorId: ambassador.id, isTest: false },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        orderCode: true,
        createdAt: true,
        orderStatus: true,
        ambassadorCommissionXaf: true,
        discountXaf: true,
      },
    }),
    prisma.ambassadorLedger.findMany({
      where: { ambassadorId: ambassador.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { amountXaf: true, type: true, note: true, createdAt: true },
    }),
  ]);

  return (
    <AmbassadorDashboard
      ambassador={{
        code: ambassador.code,
        fullName: ambassador.fullName,
        status: ambassador.status,
        payoutNumber: ambassador.payoutNumber,
      }}
      terms={{
        discountXaf: settings?.referralDiscountXaf ?? DEFAULT_TERMS.discountXaf,
        commissionPercent: settings?.ambassadorCommissionPercent ?? DEFAULT_TERMS.commissionPercent,
        orderCap: settings?.ambassadorCommissionOrderCap ?? DEFAULT_TERMS.orderCap,
      }}
      customerCount={customers}
      earnedXaf={balance.earnedXaf}
      paidXaf={balance.paidXaf}
      balanceXaf={balance.balanceXaf}
      orders={orders.map((o) => ({
        orderCode: o.orderCode,
        createdAt: o.createdAt.toISOString(),
        orderStatus: o.orderStatus,
        commissionXaf: o.ambassadorCommissionXaf ?? 0,
        discountXaf: o.discountXaf ?? 0,
      }))}
      ledger={ledger.map((l) => ({
        amountXaf: l.amountXaf,
        type: l.type,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}
