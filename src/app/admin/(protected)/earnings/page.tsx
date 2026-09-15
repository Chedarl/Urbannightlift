import { prisma } from "@/lib/prisma";
import { riderTipShareXaf } from "@/lib/orders/tip";
import { redirect } from "next/navigation";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { visibilityWhere } from "@/lib/orders/filters";
import { riderSettlementFromOrder } from "@/lib/orders/goodsMoney";
import { EarningsReport, type RiderLine } from "@/components/admin/EarningsReport";

export const dynamic = "force-dynamic";

/**
 * Where the revenue share becomes visible.
 *
 * The console reported turnover and nothing else — no cost side, so no way to
 * tell whether a delivery made money, and no record of the cash a rider is
 * holding. This shows, per rider: what they earned, what the company earned,
 * and what is still owed in either direction.
 */
export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) redirect("/admin/login");

  const { days: daysParam } = await searchParams;
  const days = Math.min(90, Math.max(1, Number(daysParam) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Failed attempts are a cost the console never showed. Each one is a rider
  // trip already spent, so they belong next to the revenue they didn't earn.
  const failures = await prisma.deliveryFailure.groupBy({
    by: ["reason"],
    where: { createdAt: { gte: since } },
    _count: { reason: true },
    _sum: { costXaf: true },
  });

  const delivered = await prisma.order.findMany({
    where: {
      ...visibilityWhere(),
      orderStatus: { in: ["DELIVERED", "CLOSED"] },
      completedAt: { gte: since },
    },
    select: {
      id: true,
      orderCode: true,
      completedAt: true,
      serviceType: true,
      paymentMethod: true,
      riderPayoutXaf: true,
      companyEarningXaf: true,
      cashCollectedXaf: true,
      cashSettledAt: true,
      // What the rider laid out on the customer's behalf, so the outstanding
      // column shows what they owe rather than what they spent for us.
      goodsCapXaf: true,
      goodsActualXaf: true,
      overCapApprovedXaf: true,
      goodsAdvancedXaf: true,
      tipXaf: true,
      assignedRiderId: true,
      assignedRider: { select: { fullName: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  const byRider = new Map<string, RiderLine>();
  let totalRevenue = 0;
  let totalRiderPayout = 0;
  let totalCompany = 0;
  let unsettledCash = 0;

  for (const o of delivered) {
    const payout = o.riderPayoutXaf ?? 0;
    const company = o.companyEarningXaf ?? 0;
    /*
      A tip counts toward what the rider took home and toward nothing else.

      It is deliberately absent from `totalRevenue` and `totalCompany`: revenue
      is what the business earned, and a gift passing through our account on its
      way to a rider was never ours. Counting it would flatter every figure on
      this page and make the company's margin look better in exactly the months
      customers were most generous — which is the sort of number that gets
      believed and then acted on.
    */
    const tip = riderTipShareXaf(o.tipXaf ?? 0);
    totalRevenue += payout + company;
    totalRiderPayout += payout + tip;
    totalCompany += company;

    const key = o.assignedRiderId ?? "unassigned";
    const line =
      byRider.get(key) ??
      ({
        riderId: key,
        riderName: o.assignedRider?.fullName ?? "Unassigned",
        deliveries: 0,
        earnedXaf: 0,
        companyXaf: 0,
        // Positive = the rider is holding our money; negative = we owe them.
        outstandingXaf: 0,
      } satisfies RiderLine);

    line.deliveries += 1;
    line.earnedXaf += payout + tip;
    line.companyXaf += company;

    if (!o.cashSettledAt) {
      const balance = riderSettlementFromOrder(o);
      line.outstandingXaf += balance;
      if (balance > 0) unsettledCash += balance;
    }

    byRider.set(key, line);
  }

  return (
    <EarningsReport
      days={days}
      totals={{
        deliveries: delivered.length,
        revenueXaf: totalRevenue,
        riderPayoutXaf: totalRiderPayout,
        companyEarningXaf: totalCompany,
        unsettledCashXaf: unsettledCash,
      }}
      riders={[...byRider.values()].sort((a, b) => b.earnedXaf - a.earnedXaf)}
      failures={failures
        .map((f) => ({
          reason: f.reason,
          count: f._count.reason,
          costXaf: f._sum.costXaf ?? 0,
        }))
        .sort((a, b) => b.count - a.count)}
    />
  );
}
