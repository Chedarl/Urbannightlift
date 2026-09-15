/**
 * Two kinds of money on one order: our fee, and the customer's shopping.
 *
 * On food, pharmacy and grocery orders a rider *buys things* on the customer's
 * behalf. The system did not model that at all: `Payment.amountXaf` was set to
 * the delivery fee alone, and `riderBalanceForOrder` computed a rider's
 * settlement as `cash collected − their share of the fee`. So a rider who spent
 * 5,000 XAF of real money on food and collected 6,500 at the door was recorded
 * as having collected 1,500 and *owing the company* 600. The 5,000 they
 * advanced existed nowhere. Every shopping order quietly took money out of a
 * rider's pocket.
 *
 * The fix is to stop treating an order as one number. There are two:
 *
 *   - **The delivery fee** — ours, known at checkout from the zone tariff,
 *     fixed. This is the only thing we earn on (owner's decision: no markup on
 *     somebody's groceries or medicine — the receipt is the price).
 *   - **The goods** — not ours, and *not knowable until the rider is at the
 *     counter*. Bounded at checkout by a cap the customer sets, then replaced
 *     by the actual receipt.
 *
 * Everything below follows from that split. The rules exist because each one
 * corresponds to a way this can go wrong with a real customer at 1 AM:
 *
 *  - **A cap is a promise.** Spending past it needs the customer's word first,
 *    while the rider is still in the shop. That is what prevents "I said 6,000
 *    and you charged me 11,000".
 *  - **We never invent a goods figure.** Until a rider records the receipt the
 *    total is a ceiling, described as one. This is also the honest correction to
 *    the "price confirmed" screen: the *fee* is confirmed, the shopping is not.
 *  - **The rider is made whole before anyone talks about profit.** Their
 *    settlement subtracts what they advanced, so a shopping order can never
 *    leave them down.
 */

import { clampTip, riderTipShareXaf } from "@/lib/orders/tip";

/** Services where we buy things for the customer rather than just move them. */
export const SHOPPING_SERVICES = ["FOOD_PICKUP", "MEDICINE_PICKUP", "GROCERY_PICKUP"] as const;

export type ShoppingService = (typeof SHOPPING_SERVICES)[number];

export function isShoppingService(serviceType: string): boolean {
  return (SHOPPING_SERVICES as readonly string[]).includes(serviceType);
}

export interface OrderMoneyInput {
  serviceType: string;
  /** Our fee, from the zone tariff. */
  deliveryFeeXaf: number | null;
  /** The ceiling the customer agreed to at checkout. Null when they set none. */
  goodsCapXaf: number | null;
  /** What the receipt actually said. Null until the rider records it. */
  goodsActualXaf: number | null;
  /** Set once the customer has approved going over their cap. */
  overCapApprovedXaf: number | null;
  /**
   * What the customer chose to add for the rider.
   *
   * Kept out of `deliveryFeeXaf` deliberately and permanently: the fee is the
   * published price and the thing the commission splits, and a tip that found
   * its way into it would be quietly taken 40% of. It is its own line here and
   * its own line on every screen.
   *
   * **Required, not optional.** There are nine places in this codebase that
   * compute an order's money, and an optional field means eight of them keep
   * compiling while quietly dropping a customer's tip out of the total — a
   * rider short by the exact amount somebody meant them to have, with nothing
   * anywhere saying so. Making it required turns that into a build failure, so
   * a new caller has to state what it knows. `null` is a perfectly good answer
   * and means "no tip on this order".
   */
  tipXaf: number | null;
}

export interface OrderMoney {
  /** True when this order involves buying things at all. */
  shopping: boolean;
  deliveryFeeXaf: number;
  /** The goods figure we are currently working from. */
  goodsXaf: number;
  /** Whether `goodsXaf` is a real receipt or still just the cap. */
  goodsSettled: boolean;
  /** The rider's tip, clamped. Never blended into the fee. */
  tipXaf: number;
  /** What the customer owes, tip included. A ceiling until the goods settle. */
  totalXaf: number;
  /** Copy hint: is `totalXaf` exact, or a maximum? */
  totalIsCeiling: boolean;
  /** Set when the receipt exceeded what the customer agreed to. */
  needsCustomerApproval: boolean;
  /** How far past the cap, when it matters. */
  overCapByXaf: number;
}

/**
 * What this order costs, given what we currently know.
 *
 * Deliberately pure and total: it never throws, and a missing figure produces a
 * conservative answer rather than a guess. Callers are the checkout, the review
 * screen, the rider's purchase step, the payable amount and the receipt — they
 * must all agree, so none of them does this arithmetic itself.
 */
export function orderMoney(input: OrderMoneyInput): OrderMoney {
  const fee = Math.max(0, input.deliveryFeeXaf ?? 0);
  const tip = clampTip(input.tipXaf ?? 0);
  const shopping = isShoppingService(input.serviceType);

  if (!shopping) {
    // Moving something we did not buy: the fee, plus anything they added.
    return {
      shopping: false,
      deliveryFeeXaf: fee,
      goodsXaf: 0,
      goodsSettled: true,
      tipXaf: tip,
      totalXaf: fee + tip,
      totalIsCeiling: false,
      needsCustomerApproval: false,
      overCapByXaf: 0,
    };
  }

  const cap = Math.max(0, input.goodsCapXaf ?? 0);
  const actual = input.goodsActualXaf != null ? Math.max(0, input.goodsActualXaf) : null;
  const approved = Math.max(0, input.overCapApprovedXaf ?? 0);

  // Before the rider shops, the only honest figure is the ceiling.
  if (actual == null) {
    return {
      shopping: true,
      deliveryFeeXaf: fee,
      goodsXaf: cap,
      goodsSettled: false,
      tipXaf: tip,
      totalXaf: fee + cap + tip,
      // Still a ceiling: the tip is exact, the shopping is not, and a total
      // containing one unknown is an unknown.
      totalIsCeiling: true,
      needsCustomerApproval: false,
      overCapByXaf: 0,
    };
  }

  // The receipt is in. A customer is only committed up to what they agreed to:
  // their cap, or the higher figure they explicitly approved afterwards.
  const ceiling = Math.max(cap, approved);
  const overBy = Math.max(0, actual - ceiling);

  return {
    shopping: true,
    deliveryFeeXaf: fee,
    goodsXaf: actual,
    goodsSettled: true,
    tipXaf: tip,
    totalXaf: fee + actual + tip,
    totalIsCeiling: false,
    // Over the agreed ceiling: somebody has to ask before this is collectable.
    needsCustomerApproval: overBy > 0,
    overCapByXaf: overBy,
  };
}

/**
 * What the rider is owed or owes once the night is done.
 *
 * Positive = the rider is holding company money and owes it at settlement.
 * Negative = the company owes the rider.
 *
 * The goods they advanced come off first, which is the whole point: a rider who
 * spent 5,000 of the company's float and collected 6,500 hands back 6,500 less
 * their own 900 share, and is never out of pocket for having gone shopping.
 */
export function riderSettlementForOrder(args: {
  paymentMethod: string;
  /** The rider's share of the delivery fee. */
  riderPayoutXaf: number | null;
  /** What they actually took at the door. Null on a non-cash order. */
  cashCollectedXaf: number | null;
  /** What they laid out for the goods, from the float or their pocket. */
  goodsAdvancedXaf: number | null;
  /** The full amount due on the order, from `orderMoney().totalXaf`. */
  totalDueXaf: number;
  /**
   * What the customer added for the rider. All of it is theirs.
   *
   * Required for the same reason as above: a settlement that silently omits it
   * is a rider paid less than the customer paid, which is the one arithmetic
   * error in this system that nobody would ever report.
   */
  tipXaf: number | null;
}): number {
  const payout = args.riderPayoutXaf ?? 0;
  const advanced = Math.max(0, args.goodsAdvancedXaf ?? 0);
  /*
    The tip comes off the rider's side in both branches, because in both
    branches the rider keeps it — the only difference is who was holding it.

    On cash it is inside what they collected at the door, so subtracting it here
    is what stops it being counted as company money they owe back. On mobile
    money it arrived with our fee, so subtracting it here is what puts it on the
    list of things we owe them.

    `riderTipShareXaf` rather than the raw number, so there is exactly one place
    in the codebase where the rider's portion of a tip is decided.
  */
  const tip = riderTipShareXaf(args.tipXaf ?? 0);

  if (args.paymentMethod === "CASH") {
    // A shortfall stays visible as a shortfall rather than being netted away.
    const collected = args.cashCollectedXaf ?? args.totalDueXaf;
    return collected - payout - advanced - tip;
  }
  // Paid to us directly: we owe them their share, what they advanced, and the
  // whole of the tip.
  return -(payout + advanced + tip);
}

/**
 * The same answer, computed straight from a delivered order's stored columns.
 *
 * Both places that ask this question — the earnings report and the cash
 * settlement endpoint — used to do the arithmetic themselves against the fee
 * alone. Two copies of a money rule is one copy too many, so they now share
 * this. It exists as the bridge between an `Order` row and the pure functions
 * above, and stays pure itself so the verify script can prove it.
 *
 * The fee comes from `riderPayoutXaf + companyEarningXaf` rather than the
 * estimate or the quote, because that pair is the split **frozen at delivery**.
 * Re-deriving it from today's tariff would silently rewrite last month's
 * accounts, which is the one thing a rider must be able to trust we never do.
 */
export function riderSettlementFromOrder(order: {
  serviceType: string;
  paymentMethod: string;
  riderPayoutXaf: number | null;
  companyEarningXaf: number | null;
  cashCollectedXaf: number | null;
  goodsCapXaf: number | null;
  goodsActualXaf: number | null;
  overCapApprovedXaf: number | null;
  goodsAdvancedXaf: number | null;
  tipXaf: number | null;
}): number {
  // No frozen split yet means the delivery is not finished; there is nothing to
  // settle, and guessing would put a number on an order that has not earned one.
  if (order.riderPayoutXaf == null || order.companyEarningXaf == null) return 0;

  const money = orderMoney({
    serviceType: order.serviceType,
    deliveryFeeXaf: order.riderPayoutXaf + order.companyEarningXaf,
    goodsCapXaf: order.goodsCapXaf,
    goodsActualXaf: order.goodsActualXaf,
    overCapApprovedXaf: order.overCapApprovedXaf,
    tipXaf: order.tipXaf,
  });

  return riderSettlementForOrder({
    paymentMethod: order.paymentMethod,
    riderPayoutXaf: order.riderPayoutXaf,
    cashCollectedXaf: order.cashCollectedXaf,
    goodsAdvancedXaf: order.goodsAdvancedXaf,
    totalDueXaf: money.totalXaf,
    tipXaf: order.tipXaf,
  });
}
