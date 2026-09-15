/**
 * The first delivery, free.
 *
 * ## Why this exists
 *
 * The product has **zero completed orders**. At zero, the binding constraint is
 * not margin — it is proof. Nobody in Yaoundé has yet had the experience of
 * ordering at 1 a.m. and having it arrive, and no amount of repricing creates
 * that. Every delivery business that got past this point bought the first
 * hundred orders: Meituan, Glovo and DoorDash all launched on a waived fee.
 *
 * ## What it is not
 *
 * It is **not** a discount off an inflated price. The bands were cut in the
 * same change that added this, and the offer sits on top of the new, lower
 * figure — so a customer who reads both sees a real price and a gift, rather
 * than a fake price and a fake saving. The distinction matters because the
 * second kind is discovered on the second order, and what it teaches is that
 * the published price was never real.
 *
 * ## Three rules
 *
 * **The rider is paid in full.** The waiver is the business's cost, taken out
 * of the business's share. A promotion funded by the person on the bike is not
 * a promotion. This module returns only what the *customer* does not pay; the
 * earnings split upstream keeps working off the full fee.
 *
 * **It is capped.** An open-ended waiver on a 20 km RED-zone errand is a bill
 * nobody agreed to. Above the cap the customer pays the difference, and the
 * screen says so rather than surprising them at the door.
 *
 * **First means first.** Not "first this month", not per-device — the
 * customer's first *completed* order, counted server-side. A guest ordering
 * from a new browser each night is not a new customer, and the count is taken
 * from the `Customer` row their WhatsApp number resolves to.
 */

export interface LaunchOffer {
  /** What the customer does not pay. Never more than the fee. */
  waivedXaf: number;
  /** What they still owe after the waiver. */
  payableXaf: number;
  /** True when the fee ran past the cap and they are paying the difference. */
  cappedOut: boolean;
}

export interface LaunchOfferInput {
  /** The delivery fee as quoted, before any waiver. */
  feeXaf: number;
  /** How many orders this customer has already completed. */
  completedOrders: number;
  /** The cap from settings. Zero switches the whole offer off. */
  capXaf: number;
}

/**
 * Whether this order gets the launch offer, and how much of it.
 *
 * Pure, and deliberately unaware of both the database and the rider split: it
 * answers one question, so the one question can be proved.
 */
export function applyLaunchOffer({ feeXaf, completedOrders, capXaf }: LaunchOfferInput): LaunchOffer {
  const fee = Math.max(0, Math.round(feeXaf));

  // Off, or not their first. Both are the same answer and neither is an error.
  if (capXaf <= 0 || completedOrders > 0 || fee === 0) {
    return { waivedXaf: 0, payableXaf: fee, cappedOut: false };
  }

  const waivedXaf = Math.min(fee, Math.round(capXaf));
  return {
    waivedXaf,
    payableXaf: fee - waivedXaf,
    cappedOut: fee > capXaf,
  };
}

/**
 * Whether to offer it *before* there is a fee to waive — for the banner on the
 * discovery screen.
 *
 * Kept separate from `applyLaunchOffer` because the two are asked at different
 * moments and conflating them is how a banner ends up promising something the
 * checkout then declines. This one only knows whether the person is eligible;
 * it makes no claim about the amount.
 */
export function eligibleForLaunchOffer(completedOrders: number, capXaf: number): boolean {
  return capXaf > 0 && completedOrders === 0;
}

/** What the banner and the bill say, in both languages. */
export function launchOfferCopy(capXaf: number, fr: boolean) {
  return {
    banner: fr
      ? "Votre première livraison est offerte"
      : "Your first delivery is on us",
    line: fr ? "Première livraison offerte" : "First delivery, on us",
    capNote: fr
      ? `Offert jusqu'à ${capXaf.toLocaleString("fr-FR").replace(/ /g, " ")} XAF`
      : `Covered up to ${capXaf.toLocaleString("en-US").replace(/,/g, " ")} XAF`,
  };
}
