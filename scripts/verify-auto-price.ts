/**
 * Proves the auto-pricing decision, because it decides when money is agreed
 * without a human in the loop.
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

console.log("\nFirm prices — the system quotes and the customer goes straight to payment");
check(
  "green → green is firm at the tier fee",
  decideAutoPrice({ pickupZone: green, deliveryZone: green, estimatedFeeXaf: estimateDeliveryFee(green, green), highValueFlag: false, riskFlag: false }),
  { firm: true, feeXaf: 1200, reason: "FIRM" }
);
check(
  "green → yellow is firm and takes the higher fee",
  decideAutoPrice({ pickupZone: green, deliveryZone: yellow, estimatedFeeXaf: estimateDeliveryFee(green, yellow), highValueFlag: false, riskFlag: false }),
  { firm: true, feeXaf: 1800, reason: "FIRM" }
);
check(
  "medicine surcharge is included in the firm fee",
  decideAutoPrice({ pickupZone: green, deliveryZone: green, estimatedFeeXaf: estimateDeliveryFee(green, green, { isMedicine: true }), highValueFlag: false, riskFlag: false }),
  { firm: true, feeXaf: 1500, reason: "FIRM" }
);

console.log("\nA human still prices these");
check(
  "a RED delivery zone goes to review",
  decideAutoPrice({ pickupZone: green, deliveryZone: red, estimatedFeeXaf: estimateDeliveryFee(green, red), highValueFlag: false, riskFlag: false }),
  { firm: false, feeXaf: 2500, reason: "REVIEW_TIER" }
);
check(
  "a RED pickup zone goes to review even with a green drop",
  decideAutoPrice({ pickupZone: red, deliveryZone: green, estimatedFeeXaf: estimateDeliveryFee(red, green), highValueFlag: false, riskFlag: false }),
  { firm: false, feeXaf: 2500, reason: "REVIEW_TIER" }
);
check(
  "no resolvable zone cannot be auto-priced",
  decideAutoPrice({ pickupZone: null, deliveryZone: null, estimatedFeeXaf: estimateDeliveryFee(null, null), highValueFlag: false, riskFlag: false }),
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
