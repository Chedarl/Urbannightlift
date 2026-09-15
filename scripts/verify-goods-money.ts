/**
 * Proves the goods/fee split, and specifically that a rider is never left out
 * of pocket for having gone shopping — the bug this module exists to fix.
 *
 * Run: npx tsx scripts/verify-goods-money.ts
 */
import {
  orderMoney,
  riderSettlementForOrder,
  riderSettlementFromOrder,
  isShoppingService,
} from "../src/lib/orders/goodsMoney";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok ? "" : `\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

console.log("\nWhich services involve buying things");
check("food shops", isShoppingService("FOOD_PICKUP"), true);
check("pharmacy shops", isShoppingService("MEDICINE_PICKUP"), true);
check("grocery shops", isShoppingService("GROCERY_PICKUP"), true);
check("a parcel does not", isShoppingService("SMALL_PARCEL"), false);

console.log("\nA parcel: the fee is the whole story");
check("total is just the fee, and it is exact",
  (() => { const m = orderMoney({ serviceType: "SMALL_PARCEL", deliveryFeeXaf: 1500, goodsCapXaf: null, goodsActualXaf: null, overCapApprovedXaf: null , tipXaf: null});
    return { total: m.totalXaf, ceiling: m.totalIsCeiling, shopping: m.shopping }; })(),
  { total: 1500, ceiling: false, shopping: false });

console.log("\nBefore the rider shops: a ceiling, described as one");
const pre = orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: 1500, goodsCapXaf: 6000, goodsActualXaf: null, overCapApprovedXaf: null , tipXaf: null});
check("total is fee + cap", pre.totalXaf, 7500);
check("and it is flagged as a maximum, not a price", pre.totalIsCeiling, true);
check("goods are not settled yet", pre.goodsSettled, false);
check("no approval needed yet", pre.needsCustomerApproval, false);

console.log("\nAfter the receipt");
const under = orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: 1500, goodsCapXaf: 6000, goodsActualXaf: 5000, overCapApprovedXaf: null , tipXaf: null});
check("customer pays fee + the actual receipt", under.totalXaf, 6500);
check("the total is now exact", under.totalIsCeiling, false);
check("under the cap needs no approval", under.needsCustomerApproval, false);
check("we never charge the cap when the receipt was lower", under.goodsXaf, 5000);

const over = orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: 1500, goodsCapXaf: 6000, goodsActualXaf: 8000, overCapApprovedXaf: null , tipXaf: null});
check("over the cap flags for approval", over.needsCustomerApproval, true);
check("and says by how much", over.overCapByXaf, 2000);

const approvedOver = orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: 1500, goodsCapXaf: 6000, goodsActualXaf: 8000, overCapApprovedXaf: 8000 , tipXaf: null});
check("once the customer approves, no flag remains", approvedOver.needsCustomerApproval, false);
check("and the total is the approved receipt", approvedOver.totalXaf, 9500);

console.log("\nThe bug: a rider must never be out of pocket for shopping");
// The exact scenario that was broken: 5,000 of goods, 1,500 fee, 60/40 split,
// cash at the door. Old code said the rider OWED 600. They should hand over 5,600.
const settle = riderSettlementForOrder({
  paymentMethod: "CASH", riderPayoutXaf: 900, cashCollectedXaf: 6500,
  goodsAdvancedXaf: 5000, totalDueXaf: 6500, tipXaf: null,
});
check("cash order: rider hands back collected − their share − what they advanced", settle, 600);
check("the company's 40% is what is owed, not more",
  settle, 6500 - 900 - 5000);

// Same order paid by MoMo: the money reached us, so we owe them share + advance.
check("MoMo order: we owe them their share plus their outlay",
  riderSettlementForOrder({ paymentMethod: "MTN_MOMO", riderPayoutXaf: 900, cashCollectedXaf: null, goodsAdvancedXaf: 5000, totalDueXaf: 6500 , tipXaf: null}),
  -5900);

check("a pure delivery with no shopping is unchanged",
  riderSettlementForOrder({ paymentMethod: "CASH", riderPayoutXaf: 900, cashCollectedXaf: 1500, goodsAdvancedXaf: 0, totalDueXaf: 1500 , tipXaf: null}),
  600);

check("a shortfall at the door stays visible as a shortfall",
  riderSettlementForOrder({ paymentMethod: "CASH", riderPayoutXaf: 900, cashCollectedXaf: 6000, goodsAdvancedXaf: 5000, totalDueXaf: 6500 , tipXaf: null}),
  100);

console.log("\nDegenerate inputs never produce a wrong charge");
check("no fee and no cap is zero, not NaN",
  orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: null, goodsCapXaf: null, goodsActualXaf: null, overCapApprovedXaf: null , tipXaf: null}).totalXaf, 0);
check("a negative receipt is floored at zero",
  orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: 1500, goodsCapXaf: 6000, goodsActualXaf: -500, overCapApprovedXaf: null , tipXaf: null}).goodsXaf, 0);
check("no cap set means any spend needs approval",
  orderMoney({ serviceType: "FOOD_PICKUP", deliveryFeeXaf: 1500, goodsCapXaf: null, goodsActualXaf: 3000, overCapApprovedXaf: null , tipXaf: null}).needsCustomerApproval, true);

console.log("\nStraight from a delivered order's columns — the two real call sites");
// The earnings report and the settlement endpoint both call this. Until now
// they each computed the fee alone, which is the live bug being fixed.
const foodCash = {
  serviceType: "FOOD_PICKUP",
  paymentMethod: "CASH",
  riderPayoutXaf: 900,
  companyEarningXaf: 600,
  cashCollectedXaf: 6500,
  goodsCapXaf: 6000,
  goodsActualXaf: 5000,
  overCapApprovedXaf: null,
  goodsAdvancedXaf: 5000,
  tipXaf: null,
};
check("cash food order: the rider owes the company's share, not a debt for the food",
  riderSettlementFromOrder(foodCash), 600);
check("the old fee-only answer would have been wrong by exactly what they advanced",
  riderSettlementFromOrder(foodCash) - riderSettlementForOrder({
    paymentMethod: "CASH", riderPayoutXaf: 900, cashCollectedXaf: 6500, goodsAdvancedXaf: 0, totalDueXaf: 1500, tipXaf: null,
  }), -5000);
check("mobile money food order: the company owes them their share plus the outlay",
  riderSettlementFromOrder({ ...foodCash, paymentMethod: "MTN_MOMO", cashCollectedXaf: null }), -5900);
check("a parcel is untouched by any of this",
  riderSettlementFromOrder({
    serviceType: "SMALL_PARCEL", paymentMethod: "CASH", riderPayoutXaf: 900, companyEarningXaf: 600,
    cashCollectedXaf: 1500, goodsCapXaf: null, goodsActualXaf: null, overCapApprovedXaf: null, goodsAdvancedXaf: null,
    tipXaf: null,
  }), 600);
check("no frozen split yet means nothing to settle",
  riderSettlementFromOrder({ ...foodCash, riderPayoutXaf: null }), 0);
check("an unrecorded receipt falls back to the cap, never to nothing",
  riderSettlementFromOrder({ ...foodCash, goodsActualXaf: null, cashCollectedXaf: null, goodsAdvancedXaf: null }), 6600);
// The fee is read back from the frozen split rather than today's tariff, so on
// a full cash collection the answer is always exactly the company's share —
// whatever the shopping came to.
check("the frozen split decides it, and the goods wash out entirely",
  riderSettlementFromOrder({ ...foodCash, riderPayoutXaf: 1200, companyEarningXaf: 800, cashCollectedXaf: null }), 800);

console.log(`\n${failures === 0 ? "All goods-money rules hold — no rider pays for a customer's shopping." : `${failures} check(s) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
