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
import { quoteFare, fareRulesFrom, DEFAULT_FARE, type FareRules } from "../src/lib/orders/fare";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const ROOT = path.resolve(__dirname, "..");
/** Yango's published Yaoundé Economy tariff, for the comparison that matters. */
const yango = (straightKm: number) => Math.max(450, Math.round(88 * straightKm * 1.3));

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

console.log("\nThe errand is its own line, because it is what we actually sell");
{
  const plain = quoteFare({ km: 8.9, tier: "YELLOW" }, DEFAULT_FARE);
  const errand = quoteFare({ km: 8.9, tier: "YELLOW", errand: true }, DEFAULT_FARE);

  check("carrying only has no errand line", !plain.lines.some((l) => /shop/i.test(l.label)));
  check("shopping adds one", errand.lines.some((l) => /shop/i.test(l.label)));
  check(
    "and it is exactly the configured amount",
    errand.totalXaf - plain.totalXaf === DEFAULT_FARE.errandXaf,
    "the errand must be legible as a figure, not folded into the distance"
  );
  check("it is named in French too", errand.lines.some((l) => /course/i.test(l.labelFr)));
}

console.log("\nThe night premium is keyed to the clock, and crosses midnight");
{
  const at = (hour: number) => quoteFare({ km: 8.9, tier: "YELLOW", hour }, DEFAULT_FARE);
  const day = quoteFare({ km: 8.9, tier: "YELLOW" }, DEFAULT_FARE).totalXaf;

  check("19:00 is not late", at(19).totalXaf === day);
  check("22:00 is not late", at(22).totalXaf === day);
  check("23:00 is", at(23).totalXaf > day);
  check("01:00 is too — the window crosses midnight", at(1).totalXaf > day, "a night service whose band stops at midnight has no band");
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
    Math.abs(at(23).totalXaf - expected) <= 50,
    `got ${at(23).totalXaf}, expected about ${Math.round(expected)}`
  );
  check(
    "and every total is a round 50",
    [at(19), at(23), at(1)].every((f) => f.totalXaf % 50 === 0),
    "a price calculated to the franc invites an argument about the franc"
  );
  check("and the line says which hour", at(23).lines.some((l) => l.label.includes("23:00")));
}

console.log("\nThe new prices are defensible against what the market charges");
{
  const routes: [string, number, "GREEN" | "YELLOW" | "RED"][] = [
    ["Bastos → Essos", 2.4, "GREEN"],
    ["Centre-ville → Mvan", 5.9, "YELLOW"],
    ["Bastos → Mvan", 8.9, "YELLOW"],
    ["Bastos → Odza", 11.3, "RED"],
  ];

  const OLD: FareRules = {
    minimumXaf: 1000, includedKm: 2, perKmXaf: 200,
    tierMultiplier: { GREEN: 1, YELLOW: 1.1, RED: 1.25 },
    busyMultiplier: 1, errandXaf: 0, lateNightPercent: 0, lateNightFromHour: 23, riderFloorXaf: 500,
  };

  for (const [name, km, tier] of routes) {
    const before = quoteFare({ km, tier }, OLD).totalXaf;
    const after = quoteFare({ km, tier }, DEFAULT_FARE).totalXaf;

    check(
      `${name}: carrying costs less than it did`,
      after < before,
      `${before} -> ${after}. This is the half of the fare that was competing with a ride, and losing.`
    );
    check(
      `${name}: and is within 3× a Yango ride`,
      after <= yango(km) * 3,
      `${after} against ${yango(km)} — a night errand service may cost more than a daytime ride, not three times more`
    );
  }

  // The floor still holds: nothing should ever be free or near it.
  check(
    "a trip next door still costs the minimum",
    quoteFare({ km: 0.2, tier: "GREEN" }, DEFAULT_FARE).totalXaf === DEFAULT_FARE.minimumXaf
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
