/**
 * Proves the rider standing and the merchant "sell tonight" logic.
 *
 * Both tell a real person something about their money or their business, so the
 * cases that matter most here are the ones where we must NOT speak: too little
 * data, test orders, unfinished work.
 *
 * Run: npx tsx scripts/verify-rider-and-sell.ts
 */
import { riderStanding, type RiderOrderFact } from "../src/lib/riders/standing";
import { sellTonight, type MerchantOrderFact } from "../src/lib/merchants/sellTonight";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const ride = (o: Partial<RiderOrderFact> = {}): RiderOrderFact => ({
  completed: true, riderPayoutXaf: 900, ratingStars: null, isTest: false, ...o,
});

console.log("\nRider standing");
check("earnings count only finished work",
  riderStanding([ride(), ride(), ride({ completed: false })]).earnedXaf, 1800);
check("test orders never count",
  riderStanding([ride(), ride({ isTest: true, riderPayoutXaf: 5000 })]).earnedXaf, 900);
check("deliveries exclude in-flight and test",
  riderStanding([ride(), ride({ completed: false }), ride({ isTest: true })]).deliveries, 1);
check("fewer than 5 ratings shows no average",
  riderStanding([ride({ ratingStars: 5 }), ride({ ratingStars: 4 })]).rating, null);
check("5 ratings gives an average",
  riderStanding(Array.from({ length: 5 }, () => ride({ ratingStars: 4 }))).rating, 4);
check("a new rider is NEW regardless of rating",
  riderStanding([ride({ ratingStars: 5 })]).standing, "NEW");
check("high average with enough volume is STRONG",
  riderStanding(Array.from({ length: 6 }, () => ride({ ratingStars: 5 }))).standing, "STRONG");
check("a low published average is flagged NEEDS_CARE",
  riderStanding(Array.from({ length: 6 }, () => ride({ ratingStars: 3 }))).standing, "NEEDS_CARE");
check("no ratings but plenty of deliveries is STEADY",
  riderStanding(Array.from({ length: 9 }, () => ride())).standing, "STEADY");

console.log("\nSell tonight");
const NOW = new Date("2026-07-30T22:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const sale = (n: number, items: { name: string; qty: number }[], o: Partial<MerchantOrderFact> = {}): MerchantOrderFact =>
  ({ createdAt: day(n), completed: true, isTest: false, items, ...o });

const thin = [sale(1, [{ name: "Pizza", qty: 1 }]), sale(2, [{ name: "Pizza", qty: 1 }])];
check("too little data says so and gives no trend",
  { enough: sellTonight(thin, NOW).enoughData, trend: sellTonight(thin, NOW).trend },
  { enough: false, trend: "UNKNOWN" });
check("thin data still produces one honest line",
  sellTonight(thin, NOW).advice.length, 1);

// 10 sales, brochettes dominating, all inside the recent window.
const busy = [
  ...Array.from({ length: 6 }, (_, i) => sale(i + 1, [{ name: "Brochettes", qty: 2 }])),
  ...Array.from({ length: 4 }, (_, i) => sale(i + 1, [{ name: "Poisson braisé", qty: 1 }])),
];
const s = sellTonight(busy, NOW);
check("best seller is ranked first by units", s.top[0].name, "Brochettes");
check("units are summed, not orders counted", s.top[0].units, 12);
check("cancelled orders are not sales",
  sellTonight([...busy, sale(1, [{ name: "Ghost", qty: 99 }], { completed: false })], NOW).top.some((t) => t.name === "Ghost"),
  false);
check("test orders are not sales",
  sellTonight([...busy, sale(1, [{ name: "Rehearsal", qty: 99 }], { isTest: true })], NOW).top.some((t) => t.name === "Rehearsal"),
  false);
check("all-recent activity reads as GROWING", s.trend, "GROWING");

// Same volume split evenly across both windows → steady.
const steady = [
  ...Array.from({ length: 5 }, (_, i) => sale(i + 1, [{ name: "Pizza", qty: 1 }])),
  ...Array.from({ length: 5 }, (_, i) => sale(i + 16, [{ name: "Pizza", qty: 1 }])),
];
check("even activity across both windows is STEADY", sellTonight(steady, NOW).trend, "STEADY");

const fading = [
  ...Array.from({ length: 2 }, (_, i) => sale(i + 1, [{ name: "Pizza", qty: 1 }])),
  ...Array.from({ length: 8 }, (_, i) => sale(i + 16, [{ name: "Pizza", qty: 1 }])),
];
check("a real drop is FADING", sellTonight(fading, NOW).trend, "FADING");

console.log(`\n${failures === 0 ? "All rider and sell-tonight rules hold." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
