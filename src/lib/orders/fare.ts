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
/**
 * One published price, and the distance it covers.
 *
 * `upToKm` is the **road** distance the band reaches, so the last band's
 * `upToKm` is the point past which a person quotes by hand rather than the
 * point past which we refuse.
 */
export interface FareBand {
  upToKm: number;
  xaf: number;
}

export interface FareRules {
  /**
   * What we charge to carry something, by distance. No errand, no waiting —
   * the rider collects and rides.
   */
  bands: FareBand[];
  /**
   * What we charge when the rider goes in, queues, pays and comes out. A
   * separate published list rather than a surcharge on the one above, because
   * these are two different jobs and pretending otherwise is what made the old
   * bill hard to defend.
   */
  errandBands: FareBand[];
  /** The least any delivery costs, however short. Kept as the safety net. */
  minimumXaf: number;
  /** Retained for the legacy comparison screen. No longer prices anything. */
  includedKm: number;
  /** Retained for the legacy comparison screen. No longer prices anything. */
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
   * What a hard-to-reach zone adds, in francs rather than as a percentage.
   *
   * The multiplier survives above for the legacy comparison screen and no
   * longer prices anything, because it defeated the whole purpose of a
   * published list: a band of 2,000 came out at 2,150 in a YELLOW zone, which
   * is a computed decimal again and invites exactly the argument the bands were
   * drawn to end. A flat, round, named addition can be said out loud —
   * "two thousand, plus five hundred because Odza is a hard ride at night" —
   * and a percentage cannot.
   *
   * YELLOW is zero on purpose. The spread between bands already absorbs
   * ordinary variation; charging for it twice is how the old bill got fat.
   */
  tierSurchargeXaf: Record<ZoneTier, number>;
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
/**
 * The published price lists.
 *
 * ## Why bands, and not a formula
 *
 * The formula was right and unsellable. A 3 km night food order came out at
 * 1,900 XAF, and a customer comparing that against the taxi they know — Yango
 * publishes 450 XAF minimum and 88 XAF/km in Yaoundé — saw three times the
 * price for what looks like the same trip across town.
 *
 * It was never the same trip. Yango sells one movement with the passenger
 * doing everything; we send somebody who rides out, queues at a counter at
 * 1 a.m., pays with their own float and rides back. Priced like-for-like —
 * two legs plus a fifteen-minute wait at Yango's own published rates, which
 * include 25 XAF/min and 27 XAF/min of paid waiting — that errand is about
 * 1,390 XAF. So the old price was roughly 1.4x the market, not 3x.
 *
 * But nobody performs that calculation at a gate at 1 a.m. **The presentation
 * lost an argument the price would have won**, and a figure computed to the
 * franc invites exactly that argument. People here ask "how much to Mvan?" and
 * want one number they can repeat to a friend.
 *
 * So: two short lists, said out loud, no arithmetic visible. And the errand is
 * folded into its own list rather than bolted on as a surcharge, because a
 * customer should not have to add two numbers to learn one price.
 *
 * ## Where the figures come from
 *
 * The boundaries are **road** kilometres, matching the "6.4 km by road" the
 * parcel screen already prints, so a customer can check the band against the
 * figure beside it. That is why they are 4/8/13/20 rather than the rounder
 * 3/6/10/15 first drafted: straight-line distance is multiplied by 1.3 to get
 * road distance, so a 3 km hop across Bastos is 3.9 km of actual riding and
 * would have fallen into the second band while still feeling like the first.
 *
 * The near band is set so the like-for-like comparison holds at close range —
 * 1,500 against Yango's ~1,390 for the same errand — and the carry list starts
 * at 1,000, which is quotable against a taxi without explanation. Each step is
 * a round 400-700 XAF, so the whole ladder is memorable.
 *
 * Every band clears the rider floor: at a 60% share the smallest, 1,000, pays
 * 600 against a 500 floor. `verify-fare` asserts that for every band and fails
 * the build if a future edit drops one below it — a price cut that looks good
 * to a customer and quietly underpays the person on the bike is not a price
 * cut, it is a transfer.
 */
export const CARRY_BANDS: FareBand[] = [
  { upToKm: 4, xaf: 1000 },
  { upToKm: 8, xaf: 1400 },
  { upToKm: 13, xaf: 1900 },
  { upToKm: 20, xaf: 2500 },
];

export const ERRAND_BANDS: FareBand[] = [
  { upToKm: 4, xaf: 1500 },
  { upToKm: 8, xaf: 2000 },
  { upToKm: 13, xaf: 2500 },
  { upToKm: 20, xaf: 3200 },
];

export const DEFAULT_FARE: FareRules = {
  bands: CARRY_BANDS,
  errandBands: ERRAND_BANDS,
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
  tierSurchargeXaf: { GREEN: 0, YELLOW: 0, RED: 500 },
  busyMultiplier: 1,
  errandXaf: 500,
  lateNightPercent: 15,
  /*
    01:00, not 23:00.

    We trade 18:00-04:00. A "late night" premium starting at 23:00 covered half
    our own operating window and, because people order food late, most of the
    volume — which makes it not a premium but the price with an extra step, and
    an extra step a customer reads as a trick. From 01:00 it means what it says:
    riders are genuinely scarce, the roads are worse, and a customer can predict
    it from the clock. Admin-editable; one click to move it back.
  */
  lateNightFromHour: 1,
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
  /**
   * A band list off the wire is untrusted until it is a real ladder.
   *
   * A malformed or half-saved row must not silently price an order, so anything
   * that is not a non-empty list of `{upToKm, xaf}` with both positive falls
   * back to the published default rather than being patched up. The one repair
   * made is sorting: a list saved out of order is a data-entry slip, not a
   * different intention.
   */
  const bands = (key: string, fallback: FareBand[]): FareBand[] => {
    const v = settings?.[key];
    if (!Array.isArray(v) || v.length === 0) return fallback;
    const rows: FareBand[] = [];
    for (const row of v) {
      if (!row || typeof row !== "object") return fallback;
      const { upToKm, xaf } = row as Record<string, unknown>;
      if (typeof upToKm !== "number" || !Number.isFinite(upToKm) || upToKm <= 0) return fallback;
      if (typeof xaf !== "number" || !Number.isFinite(xaf) || xaf <= 0) return fallback;
      rows.push({ upToKm, xaf });
    }
    return rows.sort((a, b) => a.upToKm - b.upToKm);
  };

  return {
    bands: bands("fareBands", DEFAULT_FARE.bands),
    errandBands: bands("fareErrandBands", DEFAULT_FARE.errandBands),
    minimumXaf: num("fareMinimumXaf", DEFAULT_FARE.minimumXaf),
    includedKm: num("fareIncludedKm", DEFAULT_FARE.includedKm),
    perKmXaf: num("farePerKmXaf", DEFAULT_FARE.perKmXaf),
    tierMultiplier: {
      GREEN: 1,
      YELLOW: 1 + num("fareYellowPercent", 8) / 100,
      RED: 1 + num("fareRedPercent", 20) / 100,
    },
    tierSurchargeXaf: {
      GREEN: 0,
      YELLOW: num("fareYellowXaf", DEFAULT_FARE.tierSurchargeXaf.YELLOW),
      RED: num("fareRedXaf", DEFAULT_FARE.tierSurchargeXaf.RED),
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
 * The band this distance falls in.
 *
 * Past the last band we do not refuse and we do not extrapolate — we return the
 * top band, and `overTopBand` tells the caller to say a person will confirm it.
 * Quietly charging a guessed price for a ride nobody has priced is how a rider
 * ends up 20 km out for the fare of 15.
 */
export function pickBand(ladder: FareBand[], roadKm: number): FareBand {
  for (const band of ladder) {
    if (roadKm <= band.upToKm) return band;
  }
  return ladder[ladder.length - 1];
}

/** True when the trip runs past the published ladder and needs a human. */
export function overTopBand(ladder: FareBand[], roadKm: number): boolean {
  const top = ladder[ladder.length - 1];
  return top != null && roadKm > top.upToKm;
}

/**
 * What the band is called on a receipt.
 *
 * Named by the distance it covers rather than by a position in a list, because
 * "up to 3 km" is checkable against the map on the same screen and "band 1" is
 * not.
 */
function bandLabel(ladder: FareBand[], band: FareBand, fr: boolean): string {
  const i = ladder.indexOf(band);
  const from = i > 0 ? ladder[i - 1].upToKm : 0;
  if (from === 0) return fr ? `Jusqu'à ${band.upToKm} km` : `Up to ${band.upToKm} km`;
  return fr ? `${from} à ${band.upToKm} km` : `${from} to ${band.upToKm} km`;
}

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
  const tierAdds = rules.tierSurchargeXaf?.[tier] ?? 0;

  // No pins, no distance. Fall back to the minimum times the zone modifier and
  // say plainly that it is an estimate — better an honest approximate than a
  // confident wrong one.
  const estimated = input.km == null;
  const roadKm = input.km == null ? rules.includedKm : input.km * ROAD_FACTOR;

  /*
    One band, chosen by distance. No arithmetic on screen.

    Which list depends on what we are actually doing: carrying a thing the
    customer already has, or going in and buying one. Those were one list plus
    a 500 XAF surcharge, which meant the customer had to add two numbers to
    learn one price and the errand looked like a penalty rather than the
    service. Two published lists says it straight.
  */
  const ladder = input.errand === true ? rules.errandBands : rules.bands;
  const band = pickBand(ladder, roadKm);

  lines.push({
    label: bandLabel(ladder, band, false),
    labelFr: bandLabel(ladder, band, true),
    amountXaf: band.xaf,
  });

  let subtotal = Math.max(rules.minimumXaf, band.xaf);

  /*
    The hard-zone charge applies to a ride, not to a hop.

    A flat 500 on top of the 1,000 near band is a fifty per cent penalty for
    crossing a street, which is the *original* complaint in its new clothes:
    the old rule charged the full red tier for a 600 m trip and customers were
    right to object. `verify-fare` still asserts that and caught this on the
    first run of the bands.

    So it starts at the second band. A red zone is hard because of the ride out
    to it — worse road, further from where riders wait — and on a trip inside
    the near band there is barely a ride to be hard.
  */
  const beyondNearBand = ladder.indexOf(band) > 0;
  if (tierAdds > 0 && beyondNearBand) {
    lines.push({
      label: tier === "RED" ? "Harder to reach" : "Further out",
      labelFr: tier === "RED" ? "Accès difficile" : "Plus éloigné",
      amountXaf: tierAdds,
    });
    subtotal += tierAdds;
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
  // Nothing to add: the errand is the band now, not a surcharge on top of one.
  // `errandXaf` survives only for the legacy comparison screen.

  /*
    The late band, replacing a "busy" multiplier that was off by default and
    therefore never anything.

    A premium after 23:00 is a fact about the night rather than a lever: fewer
    riders are out, the roads are worse, and the trip genuinely costs more to
    make. A surcharge a customer can predict from the clock is forgiven; one
    that appears because demand spiked is resented, which is why this is a
    stated hour and not a surge.
  */
  /*
    The window runs from `lateNightFromHour` to 05:00, and whether that crosses
    midnight depends on the hour set.

    This used to be `hour >= from || hour < 5` unconditionally, which is right
    for 23:00 and catastrophically wrong for 01:00: every hour of the day
    satisfies `hour >= 1`, so moving the band earlier would have applied a
    night premium at nine in the morning. `verify-fare-rules` caught it on the
    first run after the move, which is the entire reason that suite prices real
    Yaoundé routes rather than asserting the arithmetic back to itself.
  */
  const hour = input.hour;
  const from = rules.lateNightFromHour;
  const crossesMidnight = from >= 5;
  const late =
    typeof hour === "number" &&
    rules.lateNightPercent > 0 &&
    (crossesMidnight ? hour >= from || hour < 5 : hour >= from && hour < 5);
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
