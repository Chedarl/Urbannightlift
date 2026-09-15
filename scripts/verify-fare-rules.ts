/**
 * Proves the fare is the owner's to set, and defensible once set.
 *
 * ## What was wrong
 *
 * `DEFAULT_FARE` carried the comment *"The knobs, all admin-editable"* while
 * being a hardcoded constant: no table, no screen, no way to move a single
 * figure without a deploy. Customers complained about pricing and nobody in the
 * business could do anything about it.
 *
 * ## And the prices themselves were indefensible
 *
 * Measured against what the market actually charges for the same journey in
 * Yaoundé — Yango publishes a 450 XAF minimum and 88 XAF/km — the old rules
 * priced a cross-town run at three to four times a ride:
 *
 * ```
 * Bastos -> Mvan, 11.6 km by road
 *   Yango Economy    ~1 020      (published tariff)
 *   moto-taxi        ~1 350      (negotiated, at night)
 *   us, before        3 200
 * ```
 *
 * The answer is not simply "charge less". It is that we were pricing the wrong
 * thing. Yango sells a **ride**. We sell an **errand** — somebody goes, queues,
 * buys and comes back, at night, when taxis are unreliable and buses have
 * stopped. So the bill splits: the ride priced near the market, the errand
 * charged as its own line the customer can see, and a late-night premium keyed
 * to the clock rather than to demand.
 *
 * A surcharge somebody can predict is forgiven. One that appears because demand
 * spiked is resented, which is why the night band is an hour and not a surge.
 *
 * Run: npx tsx scripts/verify-fare-rules.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  quoteFare,
  fareRulesFrom,
  pickBand,
  overTopBand,
  DEFAULT_FARE,
} from "../src/lib/orders/fare";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
/*
  Yango's published Yaoundé Economy tariff, in full.

  The first version of this helper was `max(450, 88 × km)` and it was wrong in a
  way that mattered: Yango charges **88 XAF/km AND 25 XAF/min**, plus 27 XAF/min
  of paid waiting after five free minutes. Pricing them on distance alone made
  the market look a third cheaper than it is, and every comparison drawn against
  it was therefore unfair to us.

  Road distance, not straight line, on both sides — a rider goes through streets.
  18 km/h is Yaoundé at night on a moto: fast enough to be honest, slow enough
  not to flatter us.
*/
const ROAD = 1.3;
const MINUTES_PER_KM = 60 / 18;

/** One movement, A to B, passenger does everything. */
const yangoRide = (straightKm: number) => {
  const roadKm = straightKm * ROAD;
  return Math.max(450, Math.round(88 * roadKm + 25 * roadKm * MINUTES_PER_KM));
};

/*
  The same rider doing our job instead: out to the shop, a wait at the counter,
  then on to the customer. This is the comparison a customer *should* be making
  and never does, which is exactly why the old formula lost an argument the
  price would have won.
*/
const yangoErrand = (straightKm: number) => {
  const toShop = yangoRide(straightKm * 0.6);
  const waiting = 10 * 27; // fifteen minutes at a counter, five of them free
  return toShop + waiting + yangoRide(straightKm);
};

console.log("The owner's numbers are used, not a constant in the bundle");
{
  const custom = fareRulesFrom({
    fareMinimumXaf: 1234, fareIncludedKm: 4, farePerKmXaf: 99,
    fareErrandXaf: 777, fareLateNightPercent: 33, fareLateNightFromHour: 21,
    fareYellowPercent: 5, fareRedPercent: 50,
  });
  check("the minimum comes from settings", custom.minimumXaf === 1234);
  check("so does the included distance", custom.includedKm === 4);
  check("and the per-km rate", custom.perKmXaf === 99);
  check("and the errand charge", custom.errandXaf === 777);
  check("and the night band", custom.lateNightPercent === 33 && custom.lateNightFromHour === 21);
  check("percentages become multipliers", custom.tierMultiplier.YELLOW === 1.05 && custom.tierMultiplier.RED === 1.5);

  // The bands are the prices now, so they are the thing that must survive the
  // round trip — and must refuse to be half-read.
  const withBands = fareRulesFrom({ fareBands: [{ upToKm: 5, xaf: 900 }, { upToKm: 2, xaf: 700 }] });
  check("saved bands are used", withBands.bands.length === 2 && withBands.bands[1].xaf === 900);
  check(
    "and are sorted on the way in",
    withBands.bands[0].upToKm === 2,
    "a list saved out of order is a data-entry slip, not a different intention"
  );
  for (const [label, bad] of [
    ["an empty list", []],
    ["a missing price", [{ upToKm: 3 }]],
    ["a negative price", [{ upToKm: 3, xaf: -1 }]],
    ["a string price", [{ upToKm: 3, xaf: "900" }]],
    ["a null row", [null]],
    ["not a list at all", "3km=900"],
  ] as const) {
    check(
      `${label} falls back to the published ladder`,
      fareRulesFrom({ fareBands: bad }).bands === DEFAULT_FARE.bands,
      "a half-read band list must never quietly price an order"
    );
  }

  // The fallback has to be the constant, not a crash — settings can be missing
  // on a fresh database, and a priceless order is worse than a default-priced one.
  for (const [label, input] of [["null", null], ["undefined", undefined], ["an empty object", {}]] as const) {
    check(`${label} falls back to the defaults`, fareRulesFrom(input).minimumXaf === DEFAULT_FARE.minimumXaf);
  }
  check(
    "and so does a nonsense value",
    fareRulesFrom({ fareMinimumXaf: Number.NaN, farePerKmXaf: -5 }).minimumXaf === DEFAULT_FARE.minimumXaf &&
      fareRulesFrom({ farePerKmXaf: -5 }).perKmXaf === DEFAULT_FARE.perKmXaf,
    "a negative rate would pay customers to order"
  );
}

console.log("\nTwo published lists, because we do two different jobs");
{
  const carry = quoteFare({ km: 8.9, tier: "YELLOW" }, DEFAULT_FARE);
  const errand = quoteFare({ km: 8.9, tier: "YELLOW", errand: true }, DEFAULT_FARE);

  check(
    "shopping costs more than carrying",
    errand.totalXaf > carry.totalXaf,
    "somebody queues, pays a float and waits; that is not the same job as carrying"
  );
  /*
    One distance line, not a distance plus an errand surcharge.

    The zone modifier and the night band are still their own lines on purpose —
    they are things a customer can check against the map and the clock. What
    must not come back is the old shape, where the *service itself* was a
    separate figure bolted onto the ride and the customer had to add two numbers
    to learn one price.
  */
  const priceLines = (f: typeof carry) => f.lines.filter((l) => l.amountXaf > 0);
  check(
    "a plain GREEN trip is a single line",
    priceLines(quoteFare({ km: 2, tier: "GREEN", errand: true }, DEFAULT_FARE)).length === 1,
    "with no zone modifier and no night band there is nothing to add up"
  );
  check(
    "and no bill anywhere carries a separate errand charge",
    ![carry, errand].some((f) => f.lines.some((l) => /shop|course/i.test(l.label + l.labelFr))),
    "the errand is the band now; a surcharge line means the old shape came back"
  );
  check(
    "the line names the distance it covers",
    /km/.test(errand.lines[0].label) && /km/.test(errand.lines[0].labelFr),
    "'band 2' is not checkable against the map on the same screen; 'up to 6 km' is"
  );

  // Every published price must be a price we would say out loud.
  for (const [label, ladder] of [["carry", DEFAULT_FARE.bands], ["errand", DEFAULT_FARE.errandBands]] as const) {
    check(
      `the ${label} ladder only goes up`,
      ladder.every((b, i) => i === 0 || (b.upToKm > ladder[i - 1].upToKm && b.xaf > ladder[i - 1].xaf)),
      "a further band that costs less is a hole somebody will find"
    );
    check(
      `every ${label} band is a round 50`,
      ladder.every((b) => b.xaf % 50 === 0),
      "a price calculated to the franc invites an argument about the franc"
    );
    /*
      The floor that makes a price cut a price cut rather than a transfer.
      At a 60% share the smallest band must still leave the rider above
      riderFloorXaf, or the cut came out of their pocket.
    */
    check(
      `every ${label} band clears the rider floor`,
      ladder.every((b) => Math.round(b.xaf * 0.6) >= DEFAULT_FARE.riderFloorXaf),
      ladder
        .filter((b) => Math.round(b.xaf * 0.6) < DEFAULT_FARE.riderFloorXaf)
        .map((b) => `${b.xaf} pays ${Math.round(b.xaf * 0.6)}, floor is ${DEFAULT_FARE.riderFloorXaf}`)
        .join("; ")
    );
  }

  check(
    "shopping is dearer than carrying at every distance",
    DEFAULT_FARE.errandBands.every((b, i) => b.xaf > DEFAULT_FARE.bands[i].xaf),
    "the two ladders must not cross, or a customer is better off lying about the service"
  );

  // Past the last band nobody guesses — a person quotes it.
  const top = DEFAULT_FARE.bands[DEFAULT_FARE.bands.length - 1];
  check(
    "a trip past the published ladder is flagged rather than extrapolated",
    overTopBand(DEFAULT_FARE.bands, top.upToKm + 5) && !overTopBand(DEFAULT_FARE.bands, top.upToKm),
    "quietly charging a guessed price is how a rider ends up 20 km out for the fare of 15"
  );
  check(
    "and is still priced at the top band rather than at nothing",
    pickBand(DEFAULT_FARE.bands, top.upToKm + 5).xaf === top.xaf
  );
}

console.log("\nThe night premium is keyed to the clock, and crosses midnight");
{
  const at = (hour: number) => quoteFare({ km: 8.9, tier: "YELLOW", hour }, DEFAULT_FARE);
  const day = quoteFare({ km: 8.9, tier: "YELLOW" }, DEFAULT_FARE).totalXaf;

  /*
    The band starts at 01:00, not 23:00, and that is the point of it.

    We trade 18:00-04:00. A premium from 23:00 covered half our own operating
    window and most of the volume, which makes it the price with an extra step
    rather than a premium — and a customer reads an extra step as a trick.
  */
  check("19:00 is not late", at(19).totalXaf === day);
  check("22:00 is not late", at(22).totalXaf === day);
  check(
    "23:00 is not late either — it is half our own trading window",
    at(23).totalXaf === day,
    "a premium that applies to most orders is not a premium"
  );
  check("01:00 is — the window crosses midnight", at(1).totalXaf > day, "a night service whose band stops at midnight has no band");
  check("03:00 is", at(3).totalXaf > day);
  check("11:00 is not", at(11).totalXaf === day, "a band keyed to the wrong clock would charge a premium at lunchtime");

  /*
    Within the 50-franc rounding, not to the franc.

    The first version of this asserted `late === round(day * 1.15)` and failed
    by 3 XAF. The code was right and the test was wrong: the premium is applied
    to the true subtotal and the *total* is rounded to the nearest 50 once at
    the end — which is better than what I asserted, because rounding twice
    drifts. Nobody in this market quotes 1 347 anyway.
  */
  const expected = day * (1 + DEFAULT_FARE.lateNightPercent / 100);
  check(
    "the premium is the configured percentage, within the 50-franc rounding",
    Math.abs(at(1).totalXaf - expected) <= 50,
    `got ${at(1).totalXaf}, expected about ${Math.round(expected)}`
  );
  check(
    "and every total is a round 50",
    [at(19), at(23), at(1)].every((f) => f.totalXaf % 50 === 0),
    "a price calculated to the franc invites an argument about the franc"
  );
  check(
    "and the line says which hour",
    at(1).lines.some((l) => l.label.includes("01:00")),
    "a premium you cannot name the hour of is a surge"
  );
}

console.log("\nThe prices hold up against what the market actually charges");
{
  const routes: [string, number, "GREEN" | "YELLOW" | "RED"][] = [
    ["Bastos → Essos", 2.4, "GREEN"],
    ["Centre-ville → Mvan", 5.9, "YELLOW"],
    ["Bastos → Mvan", 8.9, "YELLOW"],
    ["Bastos → Odza", 11.3, "RED"],
  ];

  /*
    What the old formula charged, computed here rather than through `quoteFare`.

    The first attempt at this passed `OLD` rules into `quoteFare` with a band
    priced at zero, so the `Math.max(minimum, band)` floor would fall through to
    the old arithmetic. It does not: **`quoteFare` no longer contains that
    arithmetic at all**, so every route came back at the bare minimum and the
    comparison silently measured nothing. A fixture that neutralises the code
    under test is not a fixture.

    So the old model is written out longhand, once, here — 850 minimum
    including 2.5 km, 150/km beyond it, the tier as a multiplier, a flat 500
    errand, 15% after 23:00, rounded to 50.
  */
  const oldFormula = (straightKm: number, tier: "GREEN" | "YELLOW" | "RED", errand: boolean, hour: number) => {
    const roadKm = straightKm * ROAD;
    const distance = Math.round(Math.max(0, roadKm - 2.5) * 150);
    let total = 850 + distance;
    total += Math.round(total * ({ GREEN: 1, YELLOW: 1.08, RED: 1.2 }[tier] - 1));
    if (errand) total += 500;
    if (hour >= 23 || hour < 5) total += Math.round(total * 0.15);
    return Math.round(total / 50) * 50;
  };

  for (const [name, km, tier] of routes) {
    const wasErrand = oldFormula(km, tier, true, 23);
    const nowErrand = quoteFare({ km, tier, errand: true, hour: 23 }, DEFAULT_FARE).totalXaf;
    const nowCarry = quoteFare({ km, tier }, DEFAULT_FARE).totalXaf;

    check(
      `${name}: a night errand costs less than it did`,
      nowErrand < wasErrand,
      `${wasErrand} -> ${nowErrand}`
    );
    /*
      The comparison that decides whether this business is sellable: our errand
      against the same errand bought as Yango legs plus Yango waiting. Not
      against a single Yango ride — that is the comparison customers make in
      their heads and it has never been the same journey.
    */
    check(
      `${name}: and is within 1.3× the same errand bought from Yango`,
      nowErrand <= yangoErrand(km) * 1.3,
      `${nowErrand} against ${yangoErrand(km)} for two legs plus a fifteen-minute wait`
    );
    check(
      `${name}: carrying only stays within 2× a plain Yango ride`,
      nowCarry <= yangoRide(km) * 2,
      `${nowCarry} against ${yangoRide(km)} — a parcel run at 1 a.m. may cost more than a daytime ride, not double it`
    );
  }

  // The floor still holds: nothing is ever free or near it.
  check(
    "a trip next door still costs the near band, never less",
    quoteFare({ km: 0.2, tier: "GREEN" }, DEFAULT_FARE).totalXaf === DEFAULT_FARE.bands[0].xaf
  );
  check("and an unknown distance is still an estimate", quoteFare({ km: null, tier: null }, DEFAULT_FARE).estimated);
}

console.log("\nThe numbers are reachable from a screen, and guarded on the way in");
{
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/settings/route.ts"), "utf8");
  const ui = fs.readFileSync(path.join(ROOT, "src/components/admin/SettingsManager.tsx"), "utf8");

  for (const field of ["fareMinimumXaf", "farePerKmXaf", "fareErrandXaf", "fareLateNightPercent"]) {
    check(`${field} can be saved`, route.includes(field), "a knob nothing writes is a knob nobody has");
    check(`${field} appears on the settings screen`, ui.includes(field));
  }

  check(
    "the fare is owner-only",
    /Only the owner can change the fare/.test(route),
    "these are the numbers customers pay"
  );
  check(
    "and out-of-range values are refused, not clamped",
    /must be between/.test(route),
    "a figure quietly corrected behind somebody's back is a price nobody chose"
  );
  check(
    "the screen shows a real route rather than abstract rates",
    /Bastos/.test(ui) && /quoteFare/.test(ui),
    "a per-km rate is abstract; a worked example is a decision"
  );
}

console.log(
  `\n${failures === 0 ? "The fare is the owner's to set, and each line of it can be said out loud." : `${failures} check(s) FAILED — the fare is not what it claims to be.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
