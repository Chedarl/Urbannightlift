import type { ZoneTier } from "@/lib/orders/pricing";

/**
 * When the price is already certain, nobody should have to wait for it.
 *
 * The delivery fee is not a guess: it is worked out by `estimateDeliveryFee`
 * from how far the rider actually has to ride, nudged by the zone tier and with
 * the medicine surcharge on top. Yet every
 * order used to be parked in AWAITING_DISPATCHER_REVIEW until a human sent the
 * customer that same number as a "quote", and the customer then had to accept
 * it — so the least app-like moment in the product was waiting to be told a
 * figure the system had already worked out and shown them at checkout.
 *
 * This module decides when that wait is unnecessary. When it is, the *system*
 * issues the quote at the moment the order is placed and records the customer's
 * agreement, because they saw the exact fee on the review screen and tapped
 * "place order" against it. The order goes straight to payment.
 *
 * What this deliberately does NOT change:
 *  - **Nothing downstream is loosened.** Payment still has to be verified,
 *    cash still settles at the door, and `dispatchBlocker` still refuses to
 *    send a rider until the money side is settled. This only removes a human
 *    round-trip on a number that was never in doubt.
 *  - **A red zone still gets a person.** RED maps to REVIEW_REQUIRED
 *    (`tierToStatus`), which is the existing rule that a far or difficult drop
 *    is priced by a human. Same for an order with no resolvable zone.
 *  - **Dispatch keeps the final say.** An auto-priced order can still be
 *    re-priced, held or cancelled before a rider goes out; this decides who
 *    types the first number, not who has authority over it.
 */

/** Tiers whose fee is firm enough to charge without a human checking it. */
const FIRM_TIERS: ZoneTier[] = ["GREEN", "YELLOW"];

export interface ZoneLike {
  tier: ZoneTier;
  safetyLevel?: string | null;
}

export interface AutoPriceInput {
  /** The zones actually used for the fee, after any geocode recovery. */
  pickupZone: ZoneLike | null;
  deliveryZone: ZoneLike | null;
  /** What `estimateDeliveryFee` returned. Null means it could not be priced. */
  estimatedFeeXaf: number | null;
  /** Flagged high-value or restricted/no-go: a person looks at these. */
  highValueFlag: boolean;
  riskFlag: boolean;
}

export interface AutoPriceDecision {
  /** True when the system may issue and accept the quote itself. */
  firm: boolean;
  /** The fee to quote. Only meaningful when `firm`. */
  feeXaf: number | null;
  /** Why a human is still needed — for the status note and the customer copy. */
  reason:
    | "FIRM"
    | "NO_FEE"
    | "REVIEW_TIER"
    | "HIGH_VALUE"
    | "RISK";
}

/**
 * Whether this order's price is firm enough to skip the human quote.
 *
 * Both ends are checked, not just the one the fee was computed from, because a
 * rider has to reach both — and `estimateDeliveryFee` already takes the harder
 * of the two tiers as its modifier for the same reason. So a RED zone anywhere
 * on the trip means a person prices it, whatever the distance worked out to.
 */
export function decideAutoPrice(input: AutoPriceInput): AutoPriceDecision {
  const { pickupZone, deliveryZone, estimatedFeeXaf, highValueFlag, riskFlag } = input;

  // Nothing to quote: no zone resolved, so only a person can price it.
  if (estimatedFeeXaf == null || estimatedFeeXaf <= 0) {
    return { firm: false, feeXaf: null, reason: "NO_FEE" };
  }
  // A declared value above the insured cap, or a restricted/no-go zone, is
  // exactly the case the review queue exists for.
  if (highValueFlag) return { firm: false, feeXaf: estimatedFeeXaf, reason: "HIGH_VALUE" };
  if (riskFlag) return { firm: false, feeXaf: estimatedFeeXaf, reason: "RISK" };

  // Every zone that contributed to the fee must be a firm tier. A RED zone on
  // either end means a human prices it, which is the pre-existing rule.
  const contributing = [pickupZone, deliveryZone].filter((z): z is ZoneLike => z != null);
  if (contributing.length === 0) {
    return { firm: false, feeXaf: estimatedFeeXaf, reason: "NO_FEE" };
  }
  if (!contributing.every((z) => FIRM_TIERS.includes(z.tier))) {
    return { firm: false, feeXaf: estimatedFeeXaf, reason: "REVIEW_TIER" };
  }

  return { firm: true, feeXaf: estimatedFeeXaf, reason: "FIRM" };
}

/**
 * How long to tell the customer a human quote will take, in minutes.
 *
 * A wait with a number on it is a different experience from a wait without
 * one. This is deliberately a promise we can keep on a staffed night rather
 * than an optimistic one.
 */
export const QUOTE_TARGET_MINUTES = 15;
