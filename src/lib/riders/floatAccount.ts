import "server-only";

import { prisma } from "@/lib/prisma";
import {
  riderFloatBalance,
  riderFloatAvailable,
  spendableXaf,
  type RiderFloatAccount,
  type RiderFloatEntry,
} from "@/lib/riders/float";

/**
 * One place that reads a rider's float, so nothing can disagree about it.
 *
 * Three screens ask the same question from different angles — the owner's grant
 * screen, the rider's own dashboard, and the goods endpoint deciding whether to
 * let somebody spend at a counter. If each assembled the numbers itself, the
 * rider would eventually be told they hold money the endpoint says they do not.
 *
 * `advancedXaf` is the part that is easy to forget: the ledger balance
 * deliberately does not move when a rider buys something, because a purchase
 * turns our cash into a receivable rather than paying down what they hold. What
 * is physically left in their pocket is the balance minus everything they have
 * laid out on orders that have not been settled yet.
 */

export interface RiderFloatState {
  limitXaf: number;
  suspended: boolean;
  grantedAt: Date | null;
  /** Company cash advanced to them and not yet handed back. */
  balanceXaf: number;
  /** Laid out on unsettled orders — spent, but still on our books as theirs. */
  advancedXaf: number;
  /** Actually available to spend at a counter right now. */
  spendableXaf: number;
  /** How much more we could hand them without breaching the limit. */
  headroomXaf: number;
  account: RiderFloatAccount;
  entries: RiderFloatEntry[];
}

export async function loadRiderFloat(riderId: string): Promise<RiderFloatState | null> {
  const rider = await prisma.user.findFirst({
    where: { id: riderId, role: "RIDER" },
    select: { floatLimitXaf: true, floatSuspended: true, floatGrantedAt: true },
  });
  if (!rider) return null;

  const [ledger, unsettled] = await Promise.all([
    prisma.riderFloatLedger.findMany({
      where: { riderId },
      orderBy: { createdAt: "desc" },
      select: { amountXaf: true, type: true },
    }),
    // Money already at a shop counter. `cashSettledAt` is the same marker the
    // settlement endpoint uses to decide an order is closed out, so the two
    // views of "still outstanding" cannot drift apart.
    prisma.order.findMany({
      where: {
        assignedRiderId: riderId,
        goodsAdvancedXaf: { not: null },
        cashSettledAt: null,
        archivedAt: null,
      },
      select: { goodsAdvancedXaf: true },
    }),
  ]);

  const entries: RiderFloatEntry[] = ledger.map((r) => ({
    amountXaf: r.amountXaf,
    type: r.type as RiderFloatEntry["type"],
  }));
  const account: RiderFloatAccount = {
    limitXaf: rider.floatLimitXaf,
    suspended: rider.floatSuspended,
  };
  const advancedXaf = unsettled.reduce((sum, o) => sum + (o.goodsAdvancedXaf ?? 0), 0);

  return {
    limitXaf: rider.floatLimitXaf,
    suspended: rider.floatSuspended,
    grantedAt: rider.floatGrantedAt,
    balanceXaf: riderFloatBalance(entries),
    advancedXaf,
    spendableXaf: spendableXaf(entries, advancedXaf),
    headroomXaf: riderFloatAvailable(account, entries),
    account,
    entries,
  };
}
