/**
 * Proves the auto-pricing decision, because it decides when money is agreed
 * without a human in the loop.
 *
 * **Updated for the distance-led fee.** This suite used to assert that a firm
 * price *was* the zone's tier fee — 1,200 for green, 1,800 for yellow. That is
 * no longer what a delivery costs, and the three checks that said so were
 * asserting the exact rule customers complained about. They now prove the thing
 * that actually matters here, which was never the arithmetic: **whatever
 * `estimateDeliveryFee` works out, `decideAutoPrice` quotes that figure and no
 * other**, and a RED end still fetches a human however the number was reached.
 *
 * The arithmetic itself is proved next door in `scripts/verify-fare.ts`, against
 * real Yaoundé distances. Two suites, one boundary, neither repeating the other.
 *
 * Run: npx tsx scripts/verify-auto-price.ts
 */
import { decideAutoPrice } from "../src/lib/orders/autoPrice";
import { estimateDeliveryFee, type ZonePricing } from "../src/lib/orders/pricing";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

function checkThat(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const zone = (tier: "GREEN" | "YELLOW" | "RED", feeXaf: number): ZonePricing => ({
  id: `z-${tier}`,
  feeXaf,
  medicineFeeXaf: 300,
  nightUrgencyFeeXaf: 0,
  tier,
});

const green = zone("GREEN", 1200);
const yellow = zone("YELLOW", 1800);
const red = zone("RED", 2500);

/** The decision for a trip, with or without pins. */
const decide = (
  pz: ZonePricing | null,
  dz: ZonePricing | null,
  options: Parameters<typeof estimateDeliveryFee>[2] = {}
) =>
  decideAutoPrice({
    pickupZone: pz,
    deliveryZone: dz,
    estimatedFeeXaf: estimateDeliveryFee(pz, dz, options),
    highValueFlag: false,
    riskFlag: false,
  });

console.log("\nFirm prices — the system quotes and the customer goes straight to payment");
check(
  "an unpinned green → green trip is firm at the minimum fare",
  decide(green, green),
  { firm: true, feeXaf: 1000, reason: "FIRM" }
);
check(
  "green → yellow is firm, and the yellow tier nudges the fee rather than being it",
  decide(green, yellow),
  { firm: true, feeXaf: 1100, reason: "FIRM" }
);
check(
  "the medicine surcharge is still added on top of the firm fee",
  decide(green, green, { isMedicine: true }),
  { firm: true, feeXaf: 1300, reason: "FIRM" }
);

console.log("\nDistance decides the firm figure now, not the postcode");
// Real points, so the numbers below are a night in this city rather than an
// abstraction: Bastos, the next street along, and Mvan across town.
const BASTOS = { lat: 3.894, lng: 11.517 };
const NEXT_STREET = { lat: 3.8955, lng: 11.5182 };
const MVAN = { lat: 3.82, lng: 11.53 };

const hop = decide(green, green, { pickup: BASTOS, delivery: NEXT_STREET });
const crossTown = decide(green, green, { pickup: BASTOS, delivery: MVAN });
const shortRedEnd = decide(green, yellow, { pickup: BASTOS, delivery: NEXT_STREET });

console.log(`       Bastos → next street: ${hop.feeXaf} XAF`);
console.log(`       Bastos → Mvan:        ${crossTown.feeXaf} XAF`);

check("a pinned hop down the street is firm at the minimum", hop, {
  firm: true,
  feeXaf: 1000,
  reason: "FIRM",
});
checkThat("a pinned cross-town run is firm too", crossTown.firm);
checkThat(
  "and costs more than the hop, which is the whole complaint",
  (crossTown.feeXaf ?? 0) > (hop.feeXaf ?? 0),
  `${hop.feeXaf} → ${crossTown.feeXaf}`
);
checkThat(
  "a long trip in an easy zone beats a short trip in a harder one",
  (crossTown.feeXaf ?? 0) > (shortRedEnd.feeXaf ?? 0),
  "the old rule had this backwards, and dispatch was auto-agreeing it"
);
checkThat(
  "whatever the fee works out to, that exact figure is what gets quoted",
  crossTown.feeXaf === estimateDeliveryFee(green, green, { pickup: BASTOS, delivery: MVAN }),
  "a decision that rounds or re-derives the fee is a decision that can disagree with checkout"
);

console.log("\nA human still prices these");
check(
  "a RED delivery zone goes to review",
  decide(green, red),
  { firm: false, feeXaf: 1250, reason: "REVIEW_TIER" }
);
check(
  "a RED pickup zone goes to review even with a green drop",
  decide(red, green),
  { firm: false, feeXaf: 1250, reason: "REVIEW_TIER" }
);
checkThat(
  "a RED end still goes to review however short the ride is",
  decide(green, red, { pickup: BASTOS, delivery: NEXT_STREET }).reason === "REVIEW_TIER",
  "distance decides the price; it does not decide whether a person looks at it"
);
check(
  "no resolvable zone cannot be auto-priced",
  decide(null, null),
  { firm: false, feeXaf: null, reason: "NO_FEE" }
);
check(
  "declared value above the insured cap goes to review",
  decideAutoPrice({ pickupZone: green, deliveryZone: green, estimatedFeeXaf: 1200, highValueFlag: true, riskFlag: false }),
  { firm: false, feeXaf: 1200, reason: "HIGH_VALUE" }
);
check(
  "a restricted/no-go zone goes to review",
  decideAutoPrice({ pickupZone: green, deliveryZone: green, estimatedFeeXaf: 1200, highValueFlag: false, riskFlag: true }),
  { firm: false, feeXaf: 1200, reason: "RISK" }
);
check(
  "a zero or negative fee is never auto-agreed",
  decideAutoPrice({ pickupZone: green, deliveryZone: green, estimatedFeeXaf: 0, highValueFlag: false, riskFlag: false }),
  { firm: false, feeXaf: null, reason: "NO_FEE" }
);

console.log(
  `\n${failures === 0 ? "All auto-pricing rules hold." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 1 - 1 : 1);
