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
}

export interface OrderMoney {
  /** True when this order involves buying things at all. */
  shopping: boolean;
  deliveryFeeXaf: number;
  /** The goods figure we are currently working from. */
  goodsXaf: number;
  /** Whether `goodsXaf` is a real receipt or still just the cap. */
  goodsSettled: boolean;
  /** What the customer owes. A ceiling until the goods are settled. */
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
  const shopping = isShoppingService(input.serviceType);

  if (!shopping) {
    // Moving something we did not buy: the fee is the whole story.
    return {
      shopping: false,
      deliveryFeeXaf: fee,
      goodsXaf: 0,
      goodsSettled: true,
      totalXaf: fee,
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
      totalXaf: fee + cap,
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
    totalXaf: fee + actual,
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
}): number {
  const payout = args.riderPayoutXaf ?? 0;
  const advanced = Math.max(0, args.goodsAdvancedXaf ?? 0);

  if (args.paymentMethod === "CASH") {
    // A shortfall stays visible as a shortfall rather than being netted away.
    const collected = args.cashCollectedXaf ?? args.totalDueXaf;
    return collected - payout - advanced;
  }
  // Paid to us directly: we owe them their share, plus whatever they advanced.
  return -(payout + advanced);
}
