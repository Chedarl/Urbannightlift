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
  /** Flat charge when the rider shops or collects rather than only carrying. */
  errandXaf: number;
  /** Percentage added after `lateNightFromHour`, as a real premium. */
  lateNightPercent: number;
  lateNightFromHour: number;
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
  /*
    850 rather than the 800 first proposed, and the difference is not cosmetic.

    At a 60% rider share, 800 pays the rider 480 — below `riderFloorXaf`, the
    figure that says a trip has stopped being worth making. `verify-fare` caught
    it on the first run of the new numbers, which is precisely what that floor
    is for: a price cut that looks good to a customer and quietly underpays the
    person on the bike is not a price cut, it is a transfer.

    850 × 60% = 510. Any future change to this number has to clear the same bar.
  */
  minimumXaf: 850,
  includedKm: 2.5,
  perKmXaf: 150,
  tierMultiplier: { GREEN: 1, YELLOW: 1.08, RED: 1.2 },
  busyMultiplier: 1,
  errandXaf: 500,
  lateNightPercent: 15,
  lateNightFromHour: 23,
  riderFloorXaf: 500,
};

/**
 * The owner's numbers, or these ones.
 *
 * `DEFAULT_FARE` is the fallback, not the policy. The policy lives in
 * `OperatingSettings` where somebody can change it without a deploy — which is
 * what "admin-editable" was supposed to mean the first time it was written in
 * a comment above a hardcoded constant.
 */
export function fareRulesFrom(settings: Partial<Record<string, unknown>> | null | undefined): FareRules {
  const num = (key: string, fallback: number): number => {
    const v = settings?.[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  return {
    minimumXaf: num("fareMinimumXaf", DEFAULT_FARE.minimumXaf),
    includedKm: num("fareIncludedKm", DEFAULT_FARE.includedKm),
    perKmXaf: num("farePerKmXaf", DEFAULT_FARE.perKmXaf),
    tierMultiplier: {
      GREEN: 1,
      YELLOW: 1 + num("fareYellowPercent", 8) / 100,
      RED: 1 + num("fareRedPercent", 20) / 100,
    },
    busyMultiplier: 1,
    errandXaf: num("fareErrandXaf", DEFAULT_FARE.errandXaf),
    lateNightPercent: num("fareLateNightPercent", DEFAULT_FARE.lateNightPercent),
    lateNightFromHour: num("fareLateNightFromHour", DEFAULT_FARE.lateNightFromHour),
    riderFloorXaf: num("riderFloorXaf", DEFAULT_FARE.riderFloorXaf),
  };
}

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
  /**
   * True when the rider shops, queues or collects on the customer's behalf.
   *
   * This is the line that makes the rest of the bill defensible. Yango sells a
   * *ride* — published Yaoundé tariff: 450 minimum, 88 XAF/km — and a customer
   * comparing our old flat delivery fee against that saw three to four times
   * the price for what looked like the same journey. It was not the same
   * journey: somebody went, queued, bought and came back. Charging that as its
   * own visible line prices the thing we actually sell.
   */
  errand?: boolean;
  /** The hour the order is placed, 0-23, for the late-night band. */
  hour?: number;
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

  /*
    The errand, priced as itself.

    This is the whole point of the change. A customer comparing our fee against
    Yango's published tariff — 450 minimum, 88 XAF/km in Yaoundé — saw three to
    four times the price for what looked like the same trip across town. It was
    never the same trip: somebody went, queued, bought and came back. Naming
    that as its own line is what makes the rest of the bill survive the
    comparison, because the rest of the bill is now genuinely the ride.
  */
  if (input.errand === true && rules.errandXaf > 0) {
    lines.push({ label: "We shop for you", labelFr: "Nous faisons la course", amountXaf: rules.errandXaf });
    subtotal += rules.errandXaf;
  }

  /*
    The late band, replacing a "busy" multiplier that was off by default and
    therefore never anything.

    A premium after 23:00 is a fact about the night rather than a lever: fewer
    riders are out, the roads are worse, and the trip genuinely costs more to
    make. A surcharge a customer can predict from the clock is forgiven; one
    that appears because demand spiked is resented, which is why this is a
    stated hour and not a surge.
  */
  const hour = input.hour;
  const late =
    typeof hour === "number" &&
    rules.lateNightPercent > 0 &&
    // The window crosses midnight: 23:00 and 01:00 are both "late".
    (hour >= rules.lateNightFromHour || hour < 5);
  if (late) {
    const added = Math.round((subtotal * rules.lateNightPercent) / 100);
    lines.push({
      label: `After ${String(rules.lateNightFromHour).padStart(2, "0")}:00`,
      labelFr: `Après ${String(rules.lateNightFromHour).padStart(2, "0")}h`,
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
