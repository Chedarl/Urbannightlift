/**
 * What a rider has earned, and how they are doing.
 *
 * A rider is the scarcest asset this business has, and until now the rider app
 * told them almost nothing: tonight's jobs and a lifetime delivery count. No
 * money, no rating, no sense of whether they are doing well. Meanwhile the
 * customer side got personalization, a CRM and a health score. That asymmetry
 * is how you lose good riders to whoever pays them attention first.
 *
 * This is the rider's own view of their work, computed from rows that already
 * exist (`Order.riderPayoutXaf` written at dispatch, `Order.ratingStars` from
 * the customer's CSAT). Nothing here is a new source of truth — it reads what
 * the money and the ratings already say, so it can never disagree with the
 * books or with `splitEarnings`.
 *
 * Deliberate choices:
 *  - **Only delivered work counts as earned.** A payout on an order still in
 *    flight is not money the rider has made yet, and showing it as such would
 *    be lying to them about their own income.
 *  - **A rating needs a floor to be shown.** One unlucky 3-star on a rider's
 *    second night is not a 3.0 average worth displaying; below the floor we say
 *    "not enough ratings yet" rather than publish a number that misleads.
 *  - **Test orders never count** — the same rule the earnings views already use,
 *    so a rehearsal cannot inflate anyone's figures.
 */

/** Ratings needed before an average means anything. */
export const MIN_RATINGS_FOR_AVERAGE = 5;

/** Standing bands. Deliberately coarse — this is encouragement, not a score. */
export type Standing = "NEW" | "STEADY" | "STRONG" | "NEEDS_CARE";

export interface RiderOrderFact {
  /** Delivered or closed — i.e. the job is actually finished. */
  completed: boolean;
  /** What this order paid the rider, as written at dispatch. */
  riderPayoutXaf: number | null;
  /** The customer's rating, when they left one. */
  ratingStars: number | null;
  /** Rehearsal orders are excluded from every figure. */
  isTest: boolean;
}

export interface RiderStanding {
  /** Money from finished work only. */
  earnedXaf: number;
  /** Finished deliveries, excluding test orders. */
  deliveries: number;
  /** Average stars, or null when there aren't enough ratings to be fair. */
  rating: number | null;
  ratingCount: number;
  standing: Standing;
  /** One honest sentence for the rider, keyed off the standing. */
  headline: { en: string; fr: string };
}

export function riderStanding(orders: RiderOrderFact[]): RiderStanding {
  const real = orders.filter((o) => !o.isTest);
  const done = real.filter((o) => o.completed);

  const earnedXaf = done.reduce((sum, o) => sum + (o.riderPayoutXaf ?? 0), 0);
  const deliveries = done.length;

  const rated = done.filter((o) => o.ratingStars != null);
  const ratingCount = rated.length;
  const rating =
    ratingCount >= MIN_RATINGS_FOR_AVERAGE
      ? Math.round((rated.reduce((s, o) => s + (o.ratingStars ?? 0), 0) / ratingCount) * 10) / 10
      : null;

  const standing = bandFor(deliveries, rating);
  return { earnedXaf, deliveries, rating, ratingCount, standing, headline: HEADLINE[standing] };
}

function bandFor(deliveries: number, rating: number | null): Standing {
  if (deliveries < 5) return "NEW";
  // A published average this low is a real signal, and the honest thing is to
  // say so to the rider rather than let dispatch discover it first.
  if (rating != null && rating < 3.5) return "NEEDS_CARE";
  if (rating != null && rating >= 4.5) return "STRONG";
  return "STEADY";
}

const HEADLINE: Record<Standing, { en: string; fr: string }> = {
  NEW: {
    en: "Welcome aboard. Your first nights set the tone — take them steady.",
    fr: "Bienvenue. Vos premières nuits donnent le ton — allez-y tranquillement.",
  },
  STEADY: {
    en: "Solid work. You're getting the job done, night after night.",
    fr: "Du bon travail. Vous assurez, nuit après nuit.",
  },
  STRONG: {
    en: "Customers rate you highly. You're one of the riders we count on.",
    fr: "Les clients vous notent très bien. Vous êtes un livreur sur qui on compte.",
  },
  NEEDS_CARE: {
    en: "A few recent deliveries didn't land well. Let's talk — we'd rather help than lose you.",
    fr: "Quelques livraisons récentes se sont mal passées. Parlons-en — on préfère vous aider.",
  },
};
