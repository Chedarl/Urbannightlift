import { prisma } from "@/lib/prisma";
import { riderTipShareXaf } from "@/lib/orders/tip";
import { requireRole } from "@/lib/auth/session";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { loadRiderFloat } from "@/lib/riders/floatAccount";
import { riderSettlementFromOrder } from "@/lib/orders/goodsMoney";
import { RiderEarnings } from "@/components/rider/RiderEarnings";

export const dynamic = "force-dynamic";

/**
 * What a rider has earned, and what they are carrying.
 *
 * Until now a rider saw one number — tonight's total — and had no way to check
 * it. That is a strange thing to withhold from the person the business runs on,
 * and it is the first thing anyone asks about a job that pays per delivery.
 *
 * The two halves are deliberately separate, because confusing them is how a
 * rider ends up feeling cheated: **earnings** are theirs, **float** is the
 * company's cash passing through their hands. Both are summed from the same
 * records the accounts use, so this screen and the owner's earnings report can
 * never disagree.
 */
export default async function RiderEarningsPage() {
  const rider = await requireRole(["RIDER"]);
  if (!rider) return null;

  const settings = await getOperatingSettings();
  const { start } = tonightWindow(settings.operatingStartHour);
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [orders, float, ledger] = await Promise.all([
    prisma.order.findMany({
      where: {
        assignedRiderId: rider.id,
        orderStatus: { in: ["DELIVERED", "CLOSED"] },
        archivedAt: null,
        ...(settings.testMode ? {} : { isTest: false }),
      },
      orderBy: { completedAt: "desc" },
      take: 60,
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
        goodsCapXaf: true,
        goodsActualXaf: true,
        overCapApprovedXaf: true,
        goodsAdvancedXaf: true,
        tipXaf: true,
      },
    }),
    loadRiderFloat(rider.id),
    prisma.riderFloatLedger.findMany({
      where: { riderId: rider.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amountXaf: true, type: true, note: true, createdAt: true },
    }),
  ]);

  const earned = (since?: Date) =>
    orders
      .filter((o) => !since || (o.completedAt && o.completedAt >= since))
      /*
        Their share of the fee, plus the whole of any tip.

        Without the tip this page tells a rider they earned less than they were
        actually given — the money is in their hand or in our ledger, and the
        one screen that says what the night was worth leaves it out. That is the
        specific silence this feature had to avoid: a tip nobody sees is a tip
        nobody can tell is missing.
      */
      .reduce((sum, o) => sum + (o.riderPayoutXaf ?? 0) + riderTipShareXaf(o.tipXaf ?? 0), 0);

  // Positive = they are holding company cash. Negative = the company owes them,
  // which is what a night of mobile-money orders plus goods advances looks like.
  const owedToCompanyXaf = orders
    .filter((o) => !o.cashSettledAt)
    .reduce((sum, o) => sum + riderSettlementFromOrder(o), 0);

  return (
    <RiderEarnings
      totals={{
        tonightXaf: earned(start),
        weekXaf: earned(weekStart),
        allTimeXaf: earned(),
        deliveries: orders.length,
        owedToCompanyXaf,
      }}
      float={{
        limitXaf: float?.limitXaf ?? 0,
        balanceXaf: float?.balanceXaf ?? 0,
        advancedXaf: float?.advancedXaf ?? 0,
        spendableXaf: float?.spendableXaf ?? 0,
        suspended: float?.suspended ?? false,
      }}
      ledger={ledger.map((l) => ({
        id: l.id,
        amountXaf: l.amountXaf,
        type: l.type,
        note: l.note,
        at: l.createdAt.toISOString(),
      }))}
      rows={orders.slice(0, 30).map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        at: o.completedAt?.toISOString() ?? null,
        serviceType: o.serviceType,
        payoutXaf: o.riderPayoutXaf ?? 0,
        advancedXaf: o.goodsAdvancedXaf ?? 0,
        settled: Boolean(o.cashSettledAt),
      }))}
    />
  );
}
