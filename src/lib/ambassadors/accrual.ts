import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import {
  DEFAULT_TERMS,
  commissionEarned,
  normalizeCode,
  orderEconomics,
  type AmbassadorTerms,
} from "@/lib/ambassadors/rules";

/**
 * Applying a code, and paying for it afterwards.
 *
 * Two moments, kept apart on purpose. A code is claimed when the order is
 * placed — that is when the customer sees their discount. The commission is
 * only written when the delivery is finished and paid for, because until then
 * there is nothing to pay anybody out of.
 */

export interface ResolvedCode {
  ambassadorId: string;
  code: string;
  /** 1 for their first order with us, 2 for the next, and so on. */
  orderIndex: number;
  discountXaf: number;
  commissionXaf: number;
  terms: AmbassadorTerms;
}

export async function loadTerms(): Promise<AmbassadorTerms> {
  const s = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: {
      referralDiscountXaf: true,
      ambassadorCommissionPercent: true,
      ambassadorCommissionOrderCap: true,
    },
  });
  if (!s) return DEFAULT_TERMS;
  return {
    discountXaf: s.referralDiscountXaf,
    commissionPercent: s.ambassadorCommissionPercent,
    orderCap: s.ambassadorCommissionOrderCap,
  };
}

/**
 * What an entered code is worth on this particular order, or null.
 *
 * Returns null rather than throwing on every rejection — a bad code should
 * quietly buy nothing, not fail somebody's order at checkout.
 */
export async function resolveCode({
  rawCode,
  customerPhone,
  customerId,
  feeXaf,
  riderSharePercent,
}: {
  rawCode: string;
  customerPhone: string;
  customerId: string | null;
  feeXaf: number;
  riderSharePercent: number;
}): Promise<ResolvedCode | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const ambassador = await prisma.ambassador.findUnique({ where: { code } });
  if (!ambassador || ambassador.status !== "ACTIVE") return null;

  // Nobody earns commission on their own deliveries. Without this the whole
  // programme is just a standing discount for the ambassadors themselves.
  const phone = normalizePhone(customerPhone);
  if (phone && normalizePhone(ambassador.whatsappNumber) === phone) return null;

  const terms = await loadTerms();

  // Which order this is for the customer decides both the discount and whether
  // the commission is still within its cap.
  const previousOrders = customerId
    ? await prisma.order.count({ where: { customerId, isTest: false } })
    : 0;
  const orderIndex = previousOrders + 1;

  // A returning customer already belongs to whoever brought them; a second code
  // cannot poach them, and a customer who arrived on their own stays that way.
  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { referredByAmbassadorId: true },
    });
    if (customer?.referredByAmbassadorId && customer.referredByAmbassadorId !== ambassador.id) {
      return null;
    }
    if (!customer?.referredByAmbassadorId && previousOrders > 0) return null;
  }

  const econ = orderEconomics({
    feeXaf,
    riderSharePercent,
    referred: true,
    orderIndex,
    terms,
  });

  return {
    ambassadorId: ambassador.id,
    code,
    orderIndex,
    discountXaf: econ.discountXaf,
    commissionXaf: econ.commissionXaf,
    terms,
  };
}

/**
 * Write the commission for a finished delivery.
 *
 * Idempotent by construction: the ledger has a unique index on
 * (orderId, type), so a retry, a double-click or a re-run cannot pay the same
 * delivery twice. Failures are swallowed — an accounting entry must never be
 * the reason a delivery fails to complete.
 */
export async function accrueCommission(orderId: string): Promise<number> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderCode: true,
        orderStatus: true,
        paymentStatus: true,
        paymentMethod: true,
        isTest: true,
        ambassadorId: true,
        ambassadorCommissionXaf: true,
      },
    });
    if (!order?.ambassadorId) return 0;
    if (!order.ambassadorCommissionXaf || order.ambassadorCommissionXaf <= 0) return 0;
    if (!commissionEarned(order)) return 0;

    await prisma.ambassadorLedger.create({
      data: {
        ambassadorId: order.ambassadorId,
        orderId: order.id,
        amountXaf: order.ambassadorCommissionXaf,
        type: "COMMISSION",
        note: `Delivery ${order.orderCode}`,
      },
    });
    return order.ambassadorCommissionXaf;
  } catch {
    // Almost always the unique index doing its job on a second attempt.
    return 0;
  }
}

/** Earned minus paid, straight from the ledger rather than a cached total. */
export async function ambassadorBalance(ambassadorId: string): Promise<{
  earnedXaf: number;
  paidXaf: number;
  balanceXaf: number;
}> {
  const rows = await prisma.ambassadorLedger.findMany({
    where: { ambassadorId },
    select: { amountXaf: true },
  });
  const earnedXaf = rows.filter((r) => r.amountXaf > 0).reduce((s, r) => s + r.amountXaf, 0);
  const paidXaf = rows.filter((r) => r.amountXaf < 0).reduce((s, r) => s - r.amountXaf, 0);
  return { earnedXaf, paidXaf, balanceXaf: earnedXaf - paidXaf };
}
