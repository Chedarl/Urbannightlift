import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TERMS,
  codeProblem,
  creditToApply,
  generateReferralCode,
  hasEarned,
  normalizeReferralCode,
  referralReward,
  type ReferralTerms,
} from "@/lib/referrals/rules";

/**
 * Referral codes, credit, and the reward that lands when a friend's delivery
 * actually completes.
 *
 * Every balance here is the sum of the ledger rather than a number kept
 * alongside it. `Customer.referralCreditXaf` is a cache for reading quickly;
 * the ledger is the truth, and the two are written together in one transaction
 * so they cannot drift.
 */

export async function referralTerms(): Promise<ReferralTerms> {
  const s = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: { referralRewardPercent: true, referralFriendDiscountXaf: true, referralsEnabled: true },
  });
  if (s && s.referralsEnabled === false) {
    return { rewardPercent: 0, friendDiscountXaf: 0 };
  }
  return {
    rewardPercent: s?.referralRewardPercent ?? DEFAULT_TERMS.rewardPercent,
    friendDiscountXaf: s?.referralFriendDiscountXaf ?? DEFAULT_TERMS.friendDiscountXaf,
  };
}

/**
 * Gives a customer their code, if they have not got one.
 *
 * Retries on the unique index rather than trusting randomness — six characters
 * from a 25-letter alphabet is 244 million combinations, but "unlikely" is not
 * "impossible" and a collision here would fail somebody's signup.
 */
export async function ensureReferralCode(customerId: string): Promise<string | null> {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode;
    } catch {
      // Taken — try another. Any other failure falls through to null, and a
      // missing code must never break signing up.
    }
  }
  return null;
}

/**
 * Binds a customer to whoever referred them, once and permanently.
 *
 * Returns the friend-side discount they have earned, which is zero unless the
 * owner has set one. Refuses self-referral, an unknown code, and anybody who
 * has already been referred — a customer belongs to whoever actually brought
 * them, and a later code does not move them.
 */
export async function bindReferral(
  customerId: string,
  rawCode: string
): Promise<{ referrerId: string; friendDiscountXaf: number } | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code || codeProblem(code)) return null;

  const terms = await referralTerms();
  if (terms.rewardPercent === 0 && terms.friendDiscountXaf === 0) return null;

  const [me, referrer] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, referredByCustomerId: true, referralCode: true, totalOrders: true },
    }),
    prisma.customer.findUnique({ where: { referralCode: code }, select: { id: true } }),
  ]);

  if (!me || !referrer) return null;
  if (referrer.id === customerId) return null; // nobody refers themselves
  if (me.referredByCustomerId) return null; // already belongs to someone
  if (me.referralCode === code) return null;

  await prisma.customer.update({
    where: { id: customerId },
    data: { referredByCustomerId: referrer.id, referredByCodeAt: new Date() },
  });

  // The friend's discount only makes sense on a first order.
  const friendDiscountXaf = me.totalOrders === 0 ? terms.friendDiscountXaf : 0;
  return { referrerId: referrer.id, friendDiscountXaf };
}

/**
 * Pays the referrer when their friend's delivery completes.
 *
 * Idempotent through the unique index on (orderId, type): marking an order
 * delivered twice cannot pay twice. Returns what was awarded, or 0.
 */
export async function awardReferral(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      isTest: true,
      orderStatus: true,
      paymentStatus: true,
      paymentMethod: true,
      finalDeliveryFeeXaf: true,
      quotedFeeXaf: true,
      estimatedDeliveryFeeXaf: true,
      riderPayoutXaf: true,
      ambassadorCommissionXaf: true,
      customer: { select: { id: true, referredByCustomerId: true } },
    },
  });
  if (!order?.customer?.referredByCustomerId) return 0;

  const delivered = order.orderStatus === "DELIVERED" || order.orderStatus === "CLOSED";
  const paid = order.paymentStatus === "VERIFIED" || order.paymentMethod === "CASH";
  if (!hasEarned({ delivered, paid, isTest: order.isTest })) return 0;

  const feeXaf = order.finalDeliveryFeeXaf ?? order.quotedFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0;
  const amount = referralReward({
    feeXaf,
    riderPayoutXaf: order.riderPayoutXaf ?? 0,
    otherCostsXaf: order.ambassadorCommissionXaf ?? 0,
    terms: await referralTerms(),
  });
  if (amount <= 0) return 0;

  const referrerId = order.customer.referredByCustomerId;

  try {
    await prisma.$transaction([
      prisma.referralLedger.create({
        data: {
          customerId: referrerId,
          orderId: order.id,
          amountXaf: amount,
          type: "EARNED",
          note: "A friend's delivery completed",
        },
      }),
      prisma.customer.update({
        where: { id: referrerId },
        data: { referralCreditXaf: { increment: amount } },
      }),
    ]);
    return amount;
  } catch {
    // The unique index refused it: already paid for this order.
    return 0;
  }
}

/**
 * Spends credit against an order, writing the ledger row and the new balance
 * together so the two can never disagree.
 */
export async function spendCredit(customerId: string, orderId: string, feeXaf: number): Promise<number> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { referralCreditXaf: true },
  });
  const amount = creditToApply(customer?.referralCreditXaf ?? 0, feeXaf);
  if (amount <= 0) return 0;

  try {
    await prisma.$transaction([
      prisma.referralLedger.create({
        data: { customerId, orderId, amountXaf: -amount, type: "SPENT", note: "Applied to an order" },
      }),
      prisma.customer.update({
        where: { id: customerId },
        data: { referralCreditXaf: { decrement: amount } },
      }),
    ]);
    return amount;
  } catch {
    return 0;
  }
}

/** What a customer has earned, spent and has left — summed from the ledger. */
export async function referralBalance(customerId: string): Promise<{
  earnedXaf: number;
  spentXaf: number;
  balanceXaf: number;
  friendsBrought: number;
}> {
  const [rows, friendsBrought] = await Promise.all([
    prisma.referralLedger.findMany({ where: { customerId }, select: { amountXaf: true } }),
    prisma.customer.count({ where: { referredByCustomerId: customerId } }),
  ]);
  const earnedXaf = rows.filter((r) => r.amountXaf > 0).reduce((s, r) => s + r.amountXaf, 0);
  const spentXaf = rows.filter((r) => r.amountXaf < 0).reduce((s, r) => s - r.amountXaf, 0);
  return { earnedXaf, spentXaf, balanceXaf: earnedXaf - spentXaf, friendsBrought };
}
