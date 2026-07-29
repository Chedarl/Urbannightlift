import { prisma } from "@/lib/prisma";
import { AmbassadorsManager } from "@/components/admin/AmbassadorsManager";
import { DEFAULT_TERMS } from "@/lib/ambassadors/rules";

export const dynamic = "force-dynamic";

/**
 * The marketing budget, as a list of people and what they are owed.
 *
 * Balances are summed from the ledger on every load rather than cached. A
 * running total that drifts from its entries is worse than no total at all when
 * somebody is asking why their payment was short.
 */
export default async function AmbassadorsPage() {
  const [ambassadors, settings] = await Promise.all([
    prisma.ambassador.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { customers: true, orders: true } },
        ledger: { select: { amountXaf: true } },
      },
    }),
    prisma.operatingSettings.findUnique({
      where: { id: 1 },
      select: {
        referralDiscountXaf: true,
        ambassadorCommissionPercent: true,
        ambassadorCommissionOrderCap: true,
      },
    }),
  ]);

  return (
    <AmbassadorsManager
      terms={{
        discountXaf: settings?.referralDiscountXaf ?? DEFAULT_TERMS.discountXaf,
        commissionPercent: settings?.ambassadorCommissionPercent ?? DEFAULT_TERMS.commissionPercent,
        orderCap: settings?.ambassadorCommissionOrderCap ?? DEFAULT_TERMS.orderCap,
      }}
      ambassadors={ambassadors.map((a) => {
        const earnedXaf = a.ledger.filter((l) => l.amountXaf > 0).reduce((s, l) => s + l.amountXaf, 0);
        const paidXaf = a.ledger.filter((l) => l.amountXaf < 0).reduce((s, l) => s - l.amountXaf, 0);
        return {
          id: a.id,
          code: a.code,
          fullName: a.fullName,
          whatsappNumber: a.whatsappNumber,
          payoutMethod: a.payoutMethod,
          payoutNumber: a.payoutNumber,
          status: a.status,
          notes: a.notes,
          customerCount: a._count.customers,
          orderCount: a._count.orders,
          earnedXaf,
          paidXaf,
          balanceXaf: earnedXaf - paidXaf,
        };
      })}
    />
  );
}
