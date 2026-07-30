import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { getOperatingSettings } from "@/lib/settings";
import { tonightWindow } from "@/lib/orders/tonight";
import { floatBalance, floatAvailable, type FloatEntry } from "@/lib/merchants/float";
import { MerchantHome } from "@/components/merchant/MerchantHome";

export const dynamic = "force-dynamic";

/**
 * The merchant's home: what we are bringing them tonight, and what they owe.
 *
 * The two things a shop actually wants at 9 PM are "is anything coming?" and
 * "am I open?". Everything else is one tap away.
 */
export default async function MerchantHomePage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/merchant/login");

  const settings = await getOperatingSettings();
  const { start, end } = tonightWindow(settings.operatingStartHour);

  const [tonight, ledger, recentCount] = await Promise.all([
    prisma.order.findMany({
      where: {
        merchantId: merchant.id,
        createdAt: { gte: start, lt: end },
        archivedAt: null,
        ...(settings.testMode ? {} : { isTest: false }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderCode: true,
        createdAt: true,
        orderStatus: true,
        serviceType: true,
        itemDescription: true,
        quantity: true,
      },
    }),
    prisma.merchantFloatLedger.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      select: { amountXaf: true, type: true },
    }),
    prisma.order.count({
      where: {
        merchantId: merchant.id,
        orderStatus: { in: ["DELIVERED", "CLOSED"] },
        isTest: false,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const entries: FloatEntry[] = ledger.map((l) => ({
    amountXaf: l.amountXaf,
    type: l.type as FloatEntry["type"],
  }));
  const account = { limitXaf: merchant.floatLimitXaf, suspended: merchant.floatSuspended };

  return (
    <MerchantHome
      merchantName={merchant.merchantName}
      acceptingOrders={merchant.acceptingOrders}
      deliveredLast30={recentCount}
      float={{
        limitXaf: merchant.floatLimitXaf,
        // Always summed from the ledger, never stored — the same discipline the
        // admin side uses, so the two screens cannot show different debts.
        owedXaf: floatBalance(entries),
        availableXaf: floatAvailable(account, entries),
        suspended: merchant.floatSuspended,
      }}
      orders={tonight.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        at: o.createdAt.toISOString(),
        status: o.orderStatus,
        serviceType: o.serviceType,
        what: o.itemDescription,
        quantity: o.quantity,
      }))}
    />
  );
}
