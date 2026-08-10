/**
 * What a delivery costs, and why.
 *
 * ## The complaint, and it is justified
 *
 * The old rule was one line: the fee is the **zone tier**, and nothing else.
 * `distanceKm` existed and was used only to guess an arrival time. So:
 *
 * | Trip | Old fee |
 * |---|---|
 * | 600 m across a RED zone | 2,500+ |
 * | 8 km inside one GREEN zone | 1,000 |
 * | Two neighbours, one either side of a zone line | double each other |
 *
 * Customers were not confused; they were **right**. A price that ignores how
 * far the rider actually rides is not a pricing policy, it is a postcode
 * lottery — and the zone border is a cliff you can stand on either side of.
 *
 * ## What the reference apps actually do
 *
 * Yango runs moto delivery in **Douala**, in this currency, and their published
 * tariffs are all the same shape: a **minimum fare that already includes a
 * bundle of distance**, then a **per-kilometre rate beyond it**, with a
 * multiplier at busy hours. Abidjan's car delivery, for instance, is a 550 FCFA
 * minimum that includes the first 1.5 km.
 *
 * That shape is what this implements, with the owner's decision on the one
 * question it leaves open: **zone stops being the price and becomes a
 * modifier** — a small multiplier for places that genuinely cost more to reach,
 * rather than the whole answer.
 *
 * ```
 * fee = round( max(minimum, base + perKm × billableKm) × zoneMultiplier ) + surcharges
 * ```
 *
 * ## The three rules that keep it honest
 *
 * 1. **The first kilometres are already paid for.** A short hop costs the
 *    minimum and no more, so the 600 m trip above stops being absurd.
 * 2. **No cliffs.** Distance is continuous, so one more street costs a few
 *    francs rather than doubling the bill. The zone multiplier is deliberately
 *    small for the same reason.
 * 3. **Nothing is ever priced below what it costs to run.** The rider takes
 *    their share of every fee; if a fee is so low that their share stops being
 *    worth the trip, that is a floor problem and `belowFloor` says so rather
 *    than letting it quietly happen.
 *
 * Pure, and proved by `scripts/verify-fare.ts` against real Yaoundé distances,
 * because this decides what a person is charged and must never be argued about
 * from memory.
 */

export type ZoneTier = "GREEN" | "YELLOW" | "RED";

/**
 * The knobs, all admin-editable.
 *
 * Every one is a number somebody in the business should be able to defend out
 * loud to a customer at the door. If a figure here cannot be explained in one
 * sentence, it is the wrong figure.
 */
export interface FareRules {
  /** The least any delivery costs, however short. */
  minimumXaf: number;
  /** How much distance the minimum already buys. */
  includedKm: number;
  /** Charged for each kilometre beyond `includedKm`. */
  perKmXaf: number;
  /**
   * What a zone tier does to the total, now that it is not the total.
   *
   * Deliberately gentle. A RED zone is harder to reach — worse road, further
   * from where riders wait, more risk after midnight — and that is worth a
   * fifth on top, not a doubling.
   */
  tierMultiplier: Record<ZoneTier, number>;
  /**
   * Busy-hour multiplier, applied when the owner switches it on. Off by
   * default: surge is a thing customers forgive when it is rare and resent when
   * it is routine.
   */
  busyMultiplier: number;
  /**
   * Below this, the rider's share stops being worth the trip.
   *
   * Not a price floor — the minimum fare is that. This is the number that makes
   * a bad configuration visible instead of silently underpaying somebody.
   */
  riderFloorXaf: number;
}

/**
 * Where these came from, so they can be argued with rather than inherited.
 *
 * The minimum sits close to what the cheapest old GREEN zone charged, so the
 * customers who were being treated fairly see almost no change. The per-km rate
 * is set so a typical 5 km cross-town run lands near the old YELLOW price —
 * which is roughly what such a trip was worth — and the very short hops that
 * were being overcharged fall to the minimum.
 */
export const DEFAULT_FARE: FareRules = {
  minimumXaf: 1000,
  includedKm: 2,
  perKmXaf: 200,
  tierMultiplier: { GREEN: 1, YELLOW: 1.1, RED: 1.25 },
  busyMultiplier: 1,
  riderFloorXaf: 500,
};

export interface FareInput {
  /** Straight-line km between pickup and delivery, when both are pinned. */
  km: number | null;
  /** The harder of the two ends. Null when nothing is known. */
  tier: ZoneTier | null;
  /** Medicine and night surcharges, already decided elsewhere. */
  surchargeXaf?: number;
  /** Whether the busy multiplier applies to this moment. */
  busy?: boolean;
  /** What share of the fee the rider takes, as a percentage. */
  riderSharePercent?: number;
}

/** One step of the arithmetic, in both languages, for a screen to render. */
export interface FareLine {
  label: string;
  labelFr: string;
  amountXaf: number;
}

export interface Fare {
  totalXaf: number;
  /** Every step, in order, for a screen that has to explain itself. */
  lines: FareLine[];
  /** True when distance was unknown and this is a zone-only estimate. */
  estimated: boolean;
  /**
   * True when the rider's share of this fee falls below what a trip is worth.
   *
   * Surfaced to staff, never to the customer: it is a sign the rules need
   * changing, not that this particular person should pay more.
   */
  belowFloor: boolean;
}

/** Straight-line km underestimates a real ride through real streets. */
const ROAD_FACTOR = 1.3;

/**
 * Works out the fee, and shows its working.
 *
 * Returns the lines as well as the total because a customer who can see *why*
 * a price is what it is argues with it far less than one handed a number — and
 * "you are 6 km away" is a reason, where "you are in the red zone" is a rule.
 */
export function quoteFare(input: FareInput, rules: FareRules = DEFAULT_FARE): Fare {
  const lines: FareLine[] = [];
  const tier = input.tier ?? "GREEN";
  const multiplier = rules.tierMultiplier[tier] ?? 1;

  // No pins, no distance. Fall back to the minimum times the zone modifier and
  // say plainly that it is an estimate — better an honest approximate than a
  // confident wrong one.
  const estimated = input.km == null;
  const roadKm = input.km == null ? rules.includedKm : input.km * ROAD_FACTOR;

  lines.push({
    label: `Up to ${rules.includedKm} km`,
    labelFr: `Jusqu'à ${rules.includedKm} km`,
    amountXaf: rules.minimumXaf,
  });

  const extraKm = Math.max(0, roadKm - rules.includedKm);
  const distanceXaf = Math.round(extraKm * rules.perKmXaf);
  if (distanceXaf > 0) {
    lines.push({
      label: `${extraKm.toFixed(1)} km further`,
      labelFr: `${extraKm.toFixed(1)} km de plus`,
      amountXaf: distanceXaf,
    });
  }

  let subtotal = Math.max(rules.minimumXaf, rules.minimumXaf + distanceXaf);

  if (multiplier !== 1) {
    const added = Math.round(subtotal * (multiplier - 1));
    lines.push({
      label: tier === "RED" ? "Harder to reach" : "Further out",
      labelFr: tier === "RED" ? "Accès difficile" : "Plus éloigné",
      amountXaf: added,
    });
    subtotal += added;
  }

  const busy = input.busy === true && rules.busyMultiplier > 1;
  if (busy) {
    const added = Math.round(subtotal * (rules.busyMultiplier - 1));
    lines.push({ label: "Busy right now", labelFr: "Forte demande", amountXaf: added });
    subtotal += added;
  }

  const surcharge = Math.max(0, Math.round(input.surchargeXaf ?? 0));
  if (surcharge > 0) {
    lines.push({ label: "Service charge", labelFr: "Supplément", amountXaf: surcharge });
    subtotal += surcharge;
  }

  // Rounded to the nearest 50 francs. Nobody in this market quotes 1,347, and a
  // price that looks calculated to the franc invites an argument about the
  // franc.
  const totalXaf = Math.max(rules.minimumXaf, Math.round(subtotal / 50) * 50);

  const share = input.riderSharePercent ?? 60;
  const riderTakes = Math.round((totalXaf * share) / 100);

  return { totalXaf, lines, estimated, belowFloor: riderTakes < rules.riderFloorXaf };
}

/**
 * The old rule, kept only to compare against.
 *
 * Used by the admin screen that shows what a trip *would* have cost, so the
 * change can be judged against real orders rather than asserted. Delete once
 * nobody is asking.
 */
export function legacyZoneFee(pickupFeeXaf: number | null, deliveryFeeXaf: number | null): number | null {
  if (pickupFeeXaf == null && deliveryFeeXaf == null) return null;
  return Math.max(pickupFeeXaf ?? 0, deliveryFeeXaf ?? 0);
}
