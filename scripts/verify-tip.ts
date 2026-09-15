/**
 * Proves a tip reaches the person it was meant for, whole.
 *
 * ## Why a tip needs its own suite
 *
 * Because it is the one amount of money in this system whose loss nobody would
 * ever report. A customer who adds 500 XAF for their rider does not follow it;
 * the rider does not know it was offered. If it were quietly folded into the
 * fee, 40% of it would go to the company and the arithmetic would balance
 * perfectly — every total correct, every ledger square, and a rider short by
 * 200 with no evidence anywhere that anything happened.
 *
 * So the checks here are not about the arithmetic being right. They are about
 * the arithmetic being right *for the rider*, in every mechanic, at both ends
 * of the flow, with the copy that surrounds it staying honest.
 *
 * Run: npx tsx scripts/verify-tip.ts
 */

import fs from "node:fs";
import path from "node:path";

import { clampTip, riderTipShareXaf, tipCustody, TIP_PRESETS_XAF, MAX_TIP_XAF } from "../src/lib/orders/tip";
import { orderMoney, riderSettlementForOrder, riderSettlementFromOrder } from "../src/lib/orders/goodsMoney";
import { splitEarnings } from "../src/lib/orders/earnings";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** Source with its comments removed — this repo has repeatedly failed checks on its own prose. */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("All of it goes to the rider");
{
  for (const amount of [0, 1, 200, 500, 1000, 7777, MAX_TIP_XAF]) {
    eq(`${amount} → the rider's share is ${amount}`, riderTipShareXaf(amount), amount);
  }

  /*
    The check that matters most, stated as the thing somebody would have to do
    to break it. `splitEarnings` is where 40% is taken; if a tip ever reaches
    it, the company takes a cut of a gift. So: a fee with a tip folded in must
    produce a *different* company earning than the fee alone — which is exactly
    why they are never added together anywhere in the codebase.
  */
  const feeOnly = splitEarnings(1500, 60);
  const feePlusTipByMistake = splitEarnings(1500 + 500, 60);
  check(
    "folding a tip into the fee would cost the rider money — so it is never done",
    feePlusTipByMistake.companyEarningXaf > feeOnly.companyEarningXaf,
    "if this ever fails, the split has stopped taking a share and the premise here is wrong"
  );
  eq("the company's cut of a 500 tip, were it split, would be 200", feePlusTipByMistake.companyEarningXaf - feeOnly.companyEarningXaf, 200);
}

console.log("\nThe total carries it and the fee does not");
{
  const withTip = orderMoney({
    serviceType: "SMALL_PARCEL",
    deliveryFeeXaf: 1000,
    goodsCapXaf: null,
    goodsActualXaf: null,
    overCapApprovedXaf: null,
    tipXaf: 500,
  });
  eq("the published fee is untouched", withTip.deliveryFeeXaf, 1000);
  eq("the tip is its own figure", withTip.tipXaf, 500);
  eq("the total is fee + tip", withTip.totalXaf, 1500);

  const shopping = orderMoney({
    serviceType: "FOOD_PICKUP",
    deliveryFeeXaf: 1500,
    goodsCapXaf: 6000,
    goodsActualXaf: null,
    overCapApprovedXaf: null,
    tipXaf: 500,
  });
  eq("on a shopping order the fee is still only the fee", shopping.deliveryFeeXaf, 1500);
  eq("and the goods figure is still only the goods", shopping.goodsXaf, 6000);
  eq("the ceiling is fee + goods + tip", shopping.totalXaf, 8000);
  check(
    "and it is still a ceiling — the tip is exact but the shopping is not",
    shopping.totalIsCeiling
  );

  /*
    A tip must never change the answer to "did the shop charge more than you
    agreed to". Those are different questions about different people's money,
    and an over-cap warning triggered by somebody's generosity would be the
    product accusing a pharmacy of overcharging because the customer was kind.
  */
  const overCap = orderMoney({
    serviceType: "FOOD_PICKUP",
    deliveryFeeXaf: 1500,
    goodsCapXaf: 6000,
    goodsActualXaf: 6000,
    overCapApprovedXaf: null,
    tipXaf: 5000,
  });
  check("a large tip never triggers an over-cap approval", !overCap.needsCustomerApproval);
  eq("and never inflates the over-cap figure", overCap.overCapByXaf, 0);
}

console.log("\nBoth mechanics end with the rider holding the whole tip");
{
  /*
    Cash. The customer hands over fee + goods + tip at the door. The rider keeps
    their fee share, their outlay, and the tip; what they hand back is the
    company's share and nothing else — the same 600 they would owe with no tip
    at all. A tip that changed what a rider owes the company would be the
    company taxing it.
  */
  const cashNoTip = riderSettlementForOrder({
    paymentMethod: "CASH", riderPayoutXaf: 900, cashCollectedXaf: 6500,
    goodsAdvancedXaf: 5000, totalDueXaf: 6500, tipXaf: null,
  });
  const cashWithTip = riderSettlementForOrder({
    paymentMethod: "CASH", riderPayoutXaf: 900, cashCollectedXaf: 7000,
    goodsAdvancedXaf: 5000, totalDueXaf: 7000, tipXaf: 500,
  });
  eq("cash, no tip: the rider owes the company's share", cashNoTip, 600);
  eq("cash, 500 tip: they owe exactly the same", cashWithTip, 600);

  /*
    Mobile money. The tip came to us with the fee, so we owe it onward — the
    company's debt to the rider grows by the whole tip, not 60% of it.
  */
  const momoNoTip = riderSettlementForOrder({
    paymentMethod: "MTN_MOMO", riderPayoutXaf: 900, cashCollectedXaf: null,
    goodsAdvancedXaf: 5000, totalDueXaf: 6500, tipXaf: null,
  });
  const momoWithTip = riderSettlementForOrder({
    paymentMethod: "MTN_MOMO", riderPayoutXaf: 900, cashCollectedXaf: null,
    goodsAdvancedXaf: 5000, totalDueXaf: 7000, tipXaf: 500,
  });
  eq("mobile money, no tip: we owe share + outlay", momoNoTip, -5900);
  eq("mobile money, 500 tip: we owe 500 more, not 300", momoWithTip, -6400);
  eq("which is the whole tip, to the franc", momoNoTip - momoWithTip, 500);

  // And through the stored-columns bridge, which is what settlement runs on.
  const order = {
    serviceType: "FOOD_PICKUP", paymentMethod: "MTN_MOMO",
    riderPayoutXaf: 900, companyEarningXaf: 600, cashCollectedXaf: null,
    goodsCapXaf: 6000, goodsActualXaf: 5000, overCapApprovedXaf: null,
    goodsAdvancedXaf: 5000,
  };
  eq("the settlement read from an order row agrees",
    riderSettlementFromOrder({ ...order, tipXaf: 500 }) - riderSettlementFromOrder({ ...order, tipXaf: null }),
    -500);
}

console.log("\nA mis-tap cannot cost somebody a week's money");
{
  eq("a stray digit is clamped", clampTip(500000), MAX_TIP_XAF);
  eq("negative is zero", clampTip(-500), 0);
  eq("nonsense is zero", clampTip("abc"), 0);
  eq("undefined is zero", clampTip(undefined), 0);
  eq("NaN is zero", clampTip(NaN), 0);
  eq("Infinity is zero, not the cap by accident", clampTip(Infinity), 0);
  eq("a typed string works", clampTip("500"), 500);
  eq("a fraction rounds", clampTip(499.6), 500);
  check("every preset is within the cap", TIP_PRESETS_XAF.every((n) => clampTip(n) === n));
  check("and zero leads the presets, as a real option", TIP_PRESETS_XAF[0] === 0);
}

console.log("\nCustody is named, so the copy can say the true thing");
{
  eq("no tip has no custody", tipCustody(0, "CASH"), "none");
  eq("cash: the rider is handed it", tipCustody(500, "CASH"), "rider_holds_cash");
  eq("MTN: it comes to us and we owe it on", tipCustody(500, "MTN_MOMO"), "we_owe_rider");
  eq("Orange: the same", tipCustody(500, "ORANGE_MONEY"), "we_owe_rider");
}

console.log("\nThe copy never asks for a tip by making the rider look underpaid");
{
  /*
    The line this whole feature can fail on without a single wrong number.

    A tip control is one sentence away from moving the employer's obligation
    onto the customer — "riders rely on tips", "help them earn a living wage",
    "your rider is counting on you". Those sentences are why tipping is resented
    where it is resented, and they are the easiest thing in the world for a
    later edit to add in good faith.
  */
  const chooser = code("src/components/customer/order/TipChooser.tsx");

  const guiltPhrases = [
    /rely on tips/i, /count(?:ing)? on (?:your|you)/i, /living wage/i,
    /underpaid/i, /barely/i, /survive/i, /need(?:s)? your (?:help|support)/i,
    /comptent sur/i, /salaire décent/i, /mal payé/i, /ont besoin de/i,
  ];
  for (const re of guiltPhrases) {
    check(
      `the chooser does not say ${re.source}`,
      !re.test(chooser),
      "a tip is a thank-you, never a wage subsidy the customer is asked to cover"
    );
  }

  // Nor may it imply the delivery itself depends on one.
  for (const re of [/faster/i, /priorit/i, /plus vite/i, /prioritaire/i]) {
    check(`and does not promise ${re.source} in exchange`, !re.test(chooser));
  }

  check(
    "it does say the rider keeps all of it",
    /(all of it|totalité|intégralement)/i.test(chooser),
    "the question every customer has about every tip is whether the company takes a slice"
  );
  check(
    "and it offers zero as a first-class choice",
    /None|Aucun/.test(chooser),
    "a tip chooser with no way to decline is not a choice"
  );
}

console.log("\nThe tip is never revenue, and never inside the fee");
{
  /*
    Read as source rather than behaviour, because this is a rule about how the
    code may be written: the moment a fee and a tip are added together and
    handed to the split, the behaviour tests above still pass and the rider is
    quietly short.
  */
  for (const rel of [
    "src/lib/orders/goodsMoney.ts",
    "src/lib/orders/earnings.ts",
    "src/app/api/orders/route.ts",
  ]) {
    const src = code(rel);
    const name = rel.split("/").pop();

    /*
      The first version of this check banned the string `fee + tip` outright and
      failed immediately — on `totalXaf: fee + tip`, which is the entire point
      of the feature. A total *must* contain both. What must never happen is
      narrower and worth stating precisely: a sum containing a tip being
      **assigned to something fee-shaped**, because that is the value the
      commission splits and the value the price list publishes.
    */
    check(
      `${name} never assigns a tip into a fee`,
      !/(?:deliveryFeeXaf|feeXaf|estimatedDeliveryFeeXaf|finalDeliveryFeeXaf|quotedFeeXaf)\s*[:=][^,;\n]*\btip/i.test(src),
      "the fee is what the commission splits and what the price list publishes"
    );
    check(
      `${name} never hands a tip to splitEarnings`,
      !/splitEarnings\([^)]*tip/i.test(src),
      "splitEarnings is where 40% is taken"
    );
  }

  const route = code("src/app/api/orders/route.ts");
  check("the order route clamps what arrives", route.includes("clampTip"));
  check(
    "and keeps null distinct from zero",
    /tipXaf:\s*input\.tipXaf\s*==\s*null\s*\?\s*null/.test(route),
    "null is 'before tipping existed', zero is 'offered and declined' — take-up is unknowable if they merge"
  );
}

console.log(
  `\n${failures === 0 ? "A tip is a gift, it reaches the rider whole, and nothing asks for it twice." : `${failures} check(s) FAILED — somebody's tip is not reaching the rider.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
