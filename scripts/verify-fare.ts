/**
 * Proves the new fee against the trips customers were complaining about.
 *
 * This is the suite that matters most in the codebase, because it is the only
 * one where a bug takes money from somebody. The old rule charged by zone alone
 * and customers were right to object: a 600 m hop across a RED zone cost more
 * than an 8 km ride inside a GREEN one, and two neighbours either side of a
 * zone line paid double each other.
 *
 * So the properties proved here are the complaints, restated as assertions:
 *
 *  1. **A short trip is cheap**, wherever it happens.
 *  2. **A long trip costs more than a short one**, always, everywhere.
 *  3. **There are no cliffs** — one more street costs francs, not multiples.
 *  4. **Nothing is priced below what it costs to run**, and when the rules
 *     would do that, it is visible rather than silent.
 *
 * Run: npx tsx scripts/verify-fare.ts
 */
import { quoteFare, legacyZoneFee, DEFAULT_FARE, type ZoneTier } from "../src/lib/orders/fare";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const fee = (km: number | null, tier: ZoneTier | null = "GREEN") => quoteFare({ km, tier }).totalXaf;

console.log("\nThe complaints, as assertions");
check(
  "a 600 m hop in a RED zone is no longer 2,500",
  fee(0.6, "RED") <= 1300,
  `it is now ${fee(0.6, "RED")} — the old rule charged the full red tier for crossing a street`
);
check(
  "and an 8 km ride is no longer 1,000",
  fee(8, "GREEN") > 1000,
  `it is now ${fee(8, "GREEN")} — the old rule charged the green tier however far the rider went`
);
check(
  "the long trip now costs more than the short one",
  fee(8, "GREEN") > fee(0.6, "RED"),
  "under the old rule this was backwards, which is the whole complaint"
);

console.log("\nDistance always decides more than the zone does");
for (const tier of ["GREEN", "YELLOW", "RED"] as ZoneTier[]) {
  check(`${tier}: further always costs more`, fee(1, tier) < fee(4, tier) && fee(4, tier) < fee(9, tier));
}
check(
  "a long GREEN trip beats a short RED one",
  fee(7, "GREEN") > fee(1, "RED"),
  "distance must outweigh the postcode, or we are back where we started"
);

console.log("\nNo cliffs at a zone border");
{
  // Two neighbours on the same street, one metre apart, in different zones.
  const inside = fee(3, "YELLOW");
  const over = fee(3, "RED");
  const jump = (over - inside) / inside;
  check(
    "crossing a zone line changes the price by well under a third",
    jump < 0.3,
    `${inside} → ${over} is a ${(jump * 100).toFixed(0)}% jump; the old rule could double it`
  );
}
/*
  Bands put a cliff back, and pretending otherwise would be the dishonest move.

  The old complaint was not "there is a step" — it was that the step sat on an
  **invisible, arbitrary** line. Two neighbours either side of a zone border
  paid double each other and neither could see why, because a zone border is
  not a thing you can stand and look at.

  A distance band is the opposite kind of step: the boundary is published, it is
  the same for everybody, and the screen prints "4.2 km by road" directly above
  "4 to 8 km · 2,000" so the reason is on the same screen as the price. That is
  a step somebody can check, which is the whole difference.

  What still has to be guarded is the *size* of it. A ladder with a 3x rung in
  it would be a zone border by another name, so the invariant is that no step
  more than half-again the one before, and that crossing one is worth less than
  the near band itself.
*/
console.log("\nThe band steps are visible, and bounded");
{
  const boundary = DEFAULT_FARE.bands[0].upToKm;
  // Straight-line distances either side of the first published boundary.
  const under = fee((boundary - 0.15) / 1.3, "GREEN");
  const over = fee((boundary + 0.15) / 1.3, "GREEN");
  check(
    "crossing a published boundary costs less than the near band itself",
    over - under < DEFAULT_FARE.bands[0].xaf,
    `${under} → ${over} at the ${boundary} km line`
  );

  for (const [label, ladder] of [["carry", DEFAULT_FARE.bands], ["errand", DEFAULT_FARE.errandBands]] as const) {
    const steps = ladder.slice(1).map((b, i) => b.xaf / ladder[i].xaf);
    check(
      `no ${label} step is more than half again the price before it`,
      steps.every((r) => r <= 1.5),
      steps.map((r, i) => `${ladder[i].xaf}→${ladder[i + 1].xaf} (${((r - 1) * 100).toFixed(0)}%)`).join(", ")
    );
  }
}

console.log("\nThe floor actually holds");
check(
  "a zero-distance trip costs the near band",
  fee(0) === DEFAULT_FARE.bands[0].xaf,
  "the published near price is the floor now, not the legacy minimum"
);
check("so does anything inside it", fee(1.4) === DEFAULT_FARE.bands[0].xaf);
check(
  "and nothing can ever come out below the minimum",
  [0, 0.1, 1, 1.9].every((km) => fee(km) >= DEFAULT_FARE.minimumXaf)
);
check(
  "nor below what makes the trip worth a rider's time",
  [0, 1, 3, 6, 10].every((km) => !quoteFare({ km, tier: "GREEN" }).belowFloor),
  "a price a rider will not ride for is not a price"
);

console.log("\nWith no pins it says so rather than guessing");
{
  const q = quoteFare({ km: null, tier: "YELLOW" });
  check("an unpinned trip is marked estimated", q.estimated);
  check("and still returns a usable number", q.totalXaf >= DEFAULT_FARE.minimumXaf);
  check("a pinned trip is not marked estimated", !quoteFare({ km: 3, tier: "YELLOW" }).estimated);
}

console.log("\nIt shows its working");
{
  const q = quoteFare({ km: 6, tier: "RED", surchargeXaf: 300 });
  check("every line is present", q.lines.length >= 3);
  check("every line has both languages", q.lines.every((l) => l.label && l.labelFr));
  check("no line is negative", q.lines.every((l) => l.amountXaf >= 0));
  check(
    "a surcharge appears as its own line",
    q.lines.some((l) => l.amountXaf === 300),
    "a customer must be able to see what they are paying for"
  );
}

console.log("\nThe rider is never quietly underpaid");
{
  const cheap = quoteFare({ km: 0, tier: "GREEN", riderSharePercent: 60 });
  check(
    "the minimum fare still clears the rider floor",
    !cheap.belowFloor,
    `60% of ${cheap.totalXaf} is ${Math.round(cheap.totalXaf * 0.6)}, floor is ${DEFAULT_FARE.riderFloorXaf}`
  );
  const starved = quoteFare({ km: 0, tier: "GREEN", riderSharePercent: 10 });
  check(
    "a bad share is flagged rather than silently applied",
    starved.belowFloor,
    "a configuration that underpays riders must be visible on a screen"
  );
}

console.log("\nPrices are quotable out loud");
check(
  "everything rounds to 50 francs",
  [0, 0.5, 1.7, 3.3, 6.8, 12].every((km) => fee(km) % 50 === 0),
  "nobody in this market quotes 1,347, and a to-the-franc price invites an argument about the franc"
);

console.log("\nTwo pins are enough, even with no zone row behind them");
{
  // The regression this section exists for: `quoteDeliveryFee` kept an
  // `if (!zone) return null` from the zone-only model. Under the distance model
  // that is wrong — a customer who drops two pins has told us everything the
  // fee needs — and it was quietly routing those orders into the dispatcher
  // review queue for a human to type a number the system already knew.
  const q = quoteFare({ km: 8.3, tier: null });
  check("a pinned trip with no zone is still priced", q.totalXaf > DEFAULT_FARE.minimumXaf, String(q.totalXaf));
  check("and is not marked an estimate, because the distance is real", !q.estimated);
  check(
    "an unknown zone is treated as the cheapest, never the dearest",
    quoteFare({ km: 8.3, tier: null }).totalXaf === quoteFare({ km: 8.3, tier: "GREEN" }).totalXaf,
    "guessing a customer into a surcharge because we could not identify their quartier is the postcode lottery again"
  );
}

console.log("\nAnd the old rule is still readable, for comparison");
check("the legacy fee is the higher of the two zones", legacyZoneFee(1000, 2500) === 2500);
check("with one zone it is that zone", legacyZoneFee(null, 1500) === 1500);
check("with neither it is nothing", legacyZoneFee(null, null) === null);

console.log("\nA realistic Yaoundé night, priced end to end");
for (const [label, km, tier] of [
  ["Bastos → Bastos, a few streets", 1.2, "GREEN"],
  ["Biyem-Assi → Mvan", 4.5, "YELLOW"],
  ["Odza → Bastos, right across town", 11, "RED"],
] as [string, number, ZoneTier][]) {
  const q = quoteFare({ km, tier });
  console.log(`       ${label}: ${q.totalXaf} XAF`);
  /*
    The lower bound is the configured minimum, not a literal.

    It used to be `>= 1000`, which was the old minimum written down twice — so
    when the minimum moved to 850 this failed on a price that was exactly
    right. A band pinned to a number that lives somewhere else goes stale the
    first time that number changes, and then reads as a defect.

    The real property is: no trip costs less than the minimum, and nothing
    in-city runs away to an absurd figure.
  */
  check(
    `${label} is a sane number`,
    q.totalXaf >= DEFAULT_FARE.minimumXaf && q.totalXaf <= 6000,
    `${q.totalXaf} is outside ${DEFAULT_FARE.minimumXaf}–6000`
  );
}

console.log(
  `\n${failures === 0 ? "Distance decides, the zone nudges, and nobody pays for a postcode." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
