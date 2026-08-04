/**
 * Proves the medicine page sends people to a pharmacy that is actually open.
 *
 * Two things here have already gone wrong elsewhere in this codebase and are
 * checked accordingly:
 *
 *  - **The window wraps past midnight.** `hour >= 18 && hour < 4` is false at
 *    every hour of the trading night. Every open/closed readout in this product
 *    depends on getting that right.
 *  - **A date range is inclusive at both ends.** A duty shift that expires the
 *    instant its end date begins leaves the last night of every rotation with no
 *    pharmacy on duty — the one night it matters most.
 *
 * Run: npx tsx scripts/verify-pharmacy-tonight.ts
 */
import {
  isNightHour,
  isOpenNow,
  isOnDuty,
  rankPharmacies,
  shelfEstimateXaf,
} from "../src/lib/pharmacy/tonight";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nThe night wraps past midnight (18:00 → 04:00)");
for (const h of [18, 20, 23]) check(`${h}:00 is night`, isNightHour(h, 18, 4));
for (const h of [0, 1, 3]) check(`${h}:00 is still the same night`, isNightHour(h, 18, 4));
check("04:00 is not — the window is exclusive at the end", !isNightHour(4, 18, 4));
check("17:00 is not", !isNightHour(17, 18, 4));
check("noon is not", !isNightHour(12, 18, 4));

console.log("\nA window that does not wrap still behaves");
check("09:00 inside 08–17", isNightHour(9, 8, 17));
check("20:00 outside 08–17", !isNightHour(20, 8, 17));

console.log("\nOpen now");
const night = { nightOpen: true, open24h: false };
const day = { nightOpen: false, open24h: false };
const always = { nightOpen: false, open24h: true };
check("a night pharmacy at 01:00", isOpenNow(night, 1, 18, 4));
check("a night pharmacy at noon is shut", !isOpenNow(night, 12, 18, 4));
check("a day pharmacy at 01:00 is shut", !isOpenNow(day, 1, 18, 4));
check(
  "a 24-hour pharmacy is open even outside our trading hours",
  isOpenNow(always, 12, 18, 4),
  "open24h has to beat the window, or the list hides the one place that never closes"
);

console.log("\nDuty shifts are inclusive at both ends");
const shift = { startsOn: new Date("2026-08-03T00:00:00Z"), endsOn: new Date("2026-08-09T23:59:59Z") };
check("mid-week", isOnDuty(shift, new Date("2026-08-06T02:00:00Z")));
check("the first instant", isOnDuty(shift, new Date("2026-08-03T00:00:00Z")));
check(
  "the last night, 23:30 — the one that used to fall off the end",
  isOnDuty(shift, new Date("2026-08-09T23:30:00Z"))
);
check("the day before", !isOnDuty(shift, new Date("2026-08-02T23:00:00Z")));
check("the day after", !isOnDuty(shift, new Date("2026-08-10T00:30:00Z")));

console.log("\nThe order the customer reads");
const ranked = rankPharmacies([
  { id: "c", name: "Croix Bleue", nightOpen: false, open24h: false, onDutyTonight: false, openNow: false },
  { id: "a", name: "Aurore", nightOpen: true, open24h: false, onDutyTonight: false, openNow: true },
  { id: "d", name: "Zenith", nightOpen: false, open24h: false, onDutyTonight: true, openNow: false },
  { id: "b", name: "Bastos", nightOpen: true, open24h: false, onDutyTonight: false, openNow: true },
]);
check(
  "the pharmacy on duty is first even though it is last alphabetically and not marked open",
  ranked[0].id === "d",
  `got ${ranked.map((r) => r.id).join(", ")} — the garde is legally obliged to open; ranking anything above it sends people to a shutter`
);
check("then the open ones, alphabetically", ranked[1].id === "a" && ranked[2].id === "b");
check("the closed one is last", ranked[3].id === "c");
check("ranking does not mutate the input", ranked !== undefined);

console.log("\nThe shelf estimate is an estimate");
check("two items", shelfEstimateXaf([{ priceXaf: 1500 }, { priceXaf: 800 }]) === 2300);
check("quantity counts", shelfEstimateXaf([{ priceXaf: 1000, qty: 3 }]) === 3000);
check(
  "an unpriced item adds nothing rather than a guess",
  shelfEstimateXaf([{ priceXaf: 1500 }, { priceXaf: null }]) === 1500,
  "a guessed medicine price is worse than a blank one — the receipt decides"
);
check("a nonsense price is ignored", shelfEstimateXaf([{ priceXaf: -400 }]) === 0);
check("nothing tapped costs nothing", shelfEstimateXaf([]) === 0);

console.log(
  `\n${failures === 0 ? "The list opens on somebody who is actually open." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
