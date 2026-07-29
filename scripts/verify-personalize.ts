/**
 * The portal's personalization, proved.
 *
 * The whole promise is that the portal is different for each person and honest
 * about it: the right greeting for the hour in Yaoundé, the trip you are on
 * first, your real usual (not a cancelled attempt), and a newcomer welcomed
 * rather than told which "nth night" a first visit is.
 */
import {
  greeting,
  ordinal,
  relationshipLine,
  activeOrder,
  favoriteService,
  completedNights,
  primaryIntent,
  type OrderLike,
} from "../src/lib/account/personalize";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

// Yaoundé is UTC+1. A given UTC instant must be read in local time, or a night
// service greets people at the wrong hour.
const at = (utcHour: number) => new Date(Date.UTC(2026, 6, 30, utcHour, 0, 0));

console.log("\n— the greeting knows the hour in Yaoundé, not on the server —");
{
  // 20:00 UTC = 21:00 Yaoundé → evening.
  check("21:00 local is 'Good evening'", greeting(false, at(20)) === "Good evening", greeting(false, at(20)));
  // 02:00 UTC = 03:00 Yaoundé → night, the core of this service.
  check("03:00 local is 'Good night'", greeting(false, at(2)) === "Good night", greeting(false, at(2)));
  // 07:00 UTC = 08:00 Yaoundé → morning.
  check("08:00 local is 'Good morning'", greeting(false, at(7)) === "Good morning", greeting(false, at(7)));
  check("French differs from English", greeting(true, at(20)) !== greeting(false, at(20)));
}

console.log("\n— the relationship line is sized to the relationship —");
{
  check("a newcomer is welcomed, not counted", /welcome/i.test(relationshipLine(0, false)));
  check("a one-night customer is greeted back", /back/i.test(relationshipLine(1, false)));
  check("a regular is told which night this is", /3rd night/i.test(relationshipLine(2, false)), relationshipLine(2, false));
  check("ordinals: 1st/2nd/3rd", ordinal(1, false) === "1st" && ordinal(2, false) === "2nd" && ordinal(3, false) === "3rd");
  check("ordinals: 11th/12th/13th are not st/nd/rd", ordinal(11, false) === "11th" && ordinal(12, false) === "12th" && ordinal(13, false) === "13th");
  check("ordinals: 21st, 22nd", ordinal(21, false) === "21st" && ordinal(22, false) === "22nd");
}

const order = (over: Partial<OrderLike>): OrderLike => ({
  orderCode: "UNL-X",
  orderStatus: "DELIVERED",
  serviceType: "FOOD_PICKUP",
  createdAt: "2026-07-29T20:00:00Z",
  ...over,
});

console.log("\n— the trip you are on floats to the top —");
{
  const orders = [
    order({ orderCode: "OLD", createdAt: "2026-07-01T20:00:00Z" }),
    order({ orderCode: "LIVE", orderStatus: "RIDER_GOING_TO_DELIVERY", createdAt: "2026-07-29T22:00:00Z" }),
    order({ orderCode: "ALSO_LIVE", orderStatus: "AWAITING_PAYMENT", createdAt: "2026-07-29T21:00:00Z" }),
  ];
  check("the most recent in-flight order is the active one", activeOrder(orders)?.orderCode === "LIVE", activeOrder(orders)?.orderCode);
  check("nothing in flight means no active order", activeOrder([order({})]) === null);
  check("a cancelled order is never 'active'", activeOrder([order({ orderStatus: "CANCELLED_BY_UNL" })]) === null);
}

console.log("\n— your usual is built from deliveries, not attempts —");
{
  const orders = [
    order({ serviceType: "FOOD_PICKUP" }),
    order({ serviceType: "FOOD_PICKUP" }),
    order({ serviceType: "MEDICINE_PICKUP" }),
    // Three grocery attempts that all fell over must not become "your usual".
    order({ serviceType: "GROCERY_PICKUP", orderStatus: "CANCELLED_BY_CUSTOMER" }),
    order({ serviceType: "GROCERY_PICKUP", orderStatus: "REJECTED" }),
    order({ serviceType: "GROCERY_PICKUP", orderStatus: "FAILED_DELIVERY" }),
  ];
  check("the most-delivered service wins", favoriteService(orders) === "FOOD_PICKUP", String(favoriteService(orders)));
  check("cancelled attempts do not count", favoriteService(orders) !== "GROCERY_PICKUP");
  check("a pile of undelivered orders has no usual", favoriteService([order({ orderStatus: "AWAITING_PAYMENT" })]) === null);
  check("completed nights counts only deliveries", completedNights(orders) === 3, String(completedNights(orders)));
}

console.log("\n— the portal has one clear hero —");
{
  check("in-flight → track it", primaryIntent([order({ orderStatus: "RIDER_ASSIGNED" })]) === "TRACK");
  check("a returning customer → reorder", primaryIntent([order({ orderStatus: "DELIVERED" })]) === "REORDER");
  check("a newcomer → start", primaryIntent([]) === "START");
  check(
    "an active order beats a history of deliveries",
    primaryIntent([order({ orderStatus: "DELIVERED" }), order({ orderStatus: "ITEM_COLLECTED" })]) === "TRACK"
  );
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
