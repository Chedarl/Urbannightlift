/**
 * The support desk, proved.
 *
 * Three things have to hold or this screen makes the night worse rather than
 * better: it must raise a hand at the right moment and stay quiet otherwise;
 * it must read a customer the same way twice; and a watch link — which exists
 * to be forwarded — must carry nothing worth stealing and must die on time.
 */
import {
  concernOf,
  trackingState,
  fixAgeMinutes,
  byConcern,
  isLive,
  isOutWithRider,
  type LiveOrderInput,
} from "../src/lib/orders/liveWatch";
import {
  readCustomer,
  goodwillProblem,
  GOODWILL_MAX_XAF,
  type CustomerFacts,
} from "../src/lib/customers/health";
import { createWatchToken, readWatchToken, watchWindowOpen } from "../src/lib/orders/watchLink";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const NOW = new Date("2026-07-30T01:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const order: LiveOrderInput = {
  orderStatus: "NEW_REQUEST",
  createdAt: ago(2),
  quoteSentAt: null,
  quoteAcceptedAt: null,
  paymentStatus: "PENDING",
  paymentMethod: "MTN_MOMO",
  assignedRiderId: null,
  riderAcceptedAt: null,
  assignedAt: null,
  riderLocationAt: null,
  riderLat: null,
  riderLng: null,
  customerConfirmedAt: null,
};

console.log("\n— it stays quiet when nothing is wrong —");
{
  check("a two-minute-old order is calm", concernOf(order, NOW).level === "CALM");
  check(
    "a price sent five minutes ago is calm",
    concernOf({ ...order, quoteSentAt: ago(5) }, NOW).level === "CALM"
  );
  const riding: LiveOrderInput = {
    ...order,
    orderStatus: "RIDER_GOING_TO_DELIVERY",
    quoteSentAt: ago(40),
    quoteAcceptedAt: ago(35),
    paymentStatus: "VERIFIED",
    assignedRiderId: "r1",
    assignedAt: ago(30),
    riderAcceptedAt: ago(29),
    riderLocationAt: ago(1),
    riderLat: 3.86,
    riderLng: 11.5,
  };
  check("a rider reporting a minute ago is calm", concernOf(riding, NOW).level === "CALM");
}

console.log("\n— and raises a hand when something is —");
{
  const stale = concernOf({ ...order, createdAt: ago(40) }, NOW);
  check("an order unpriced for 40 minutes is urgent", stale.level === "URGENT", stale.level);
  check("and says what to do", stale.action.length > 0, stale.action);

  const unanswered = concernOf({ ...order, quoteSentAt: ago(30) }, NOW);
  check("a price unanswered for 30 minutes is worth watching", unanswered.level === "WATCH");
  check("and the call is to the customer", /customer/i.test(unanswered.action), unanswered.action);

  const unchecked = concernOf(
    { ...order, quoteSentAt: ago(30), quoteAcceptedAt: ago(25), paymentStatus: "SUBMITTED_UNVERIFIED" },
    NOW
  );
  check("an unchecked payment proof is urgent whatever the clock says", unchecked.level === "URGENT");

  const noRider = concernOf(
    { ...order, quoteSentAt: ago(40), quoteAcceptedAt: ago(35), paymentStatus: "VERIFIED" },
    NOW
  );
  check("paid and riderless for 35 minutes is urgent", noRider.level === "URGENT", noRider.level);
  check("and the fix is to assign somebody", /assign/i.test(noRider.action), noRider.action);
}

console.log("\n— a rider who stops reporting is the thing that matters most —");
{
  const base: LiveOrderInput = {
    ...order,
    orderStatus: "RIDER_GOING_TO_DELIVERY",
    quoteSentAt: ago(40),
    quoteAcceptedAt: ago(35),
    paymentStatus: "VERIFIED",
    assignedRiderId: "r1",
    assignedAt: ago(30),
    riderAcceptedAt: ago(29),
    riderLat: 3.86,
    riderLng: 11.5,
  };
  check("live at one minute", trackingState(ago(1), NOW) === "LIVE");
  check("stale at five", trackingState(ago(5), NOW) === "STALE");
  check("lost at twenty", trackingState(ago(20), NOW) === "LOST");
  check("never, when nothing was ever sent", trackingState(null, NOW) === "NEVER");

  check("a stale fix is worth watching", concernOf({ ...base, riderLocationAt: ago(5) }, NOW).level === "WATCH");
  const lost = concernOf({ ...base, riderLocationAt: ago(20) }, NOW);
  check("a lost fix is urgent", lost.level === "URGENT", lost.level);
  check("and the call is to the rider", /rider/i.test(lost.action), lost.action);
  check("the age is reported honestly", fixAgeMinutes(ago(20), NOW) === 20, String(fixAgeMinutes(ago(20), NOW)));
  check("never-shared is watched, not screamed about", concernOf({ ...base, riderLocationAt: null }, NOW).level === "WATCH");
}

console.log("\n— cash is never held up waiting for a payment that arrives at the door —");
{
  const cash = concernOf(
    { ...order, paymentMethod: "CASH", quoteSentAt: ago(40), quoteAcceptedAt: ago(35) },
    NOW
  );
  check("a cash order goes straight to needing a rider", /assign/i.test(cash.action), cash.action);
}

console.log("\n— the worst thing is always at the top —");
{
  const rows = [
    { concern: concernOf(order, NOW), createdAt: ago(2) },
    { concern: concernOf({ ...order, createdAt: ago(40) }, NOW), createdAt: ago(40) },
    { concern: concernOf({ ...order, quoteSentAt: ago(30) }, NOW), createdAt: ago(30) },
  ].sort(byConcern);
  check("urgent first", rows[0].concern.level === "URGENT", rows[0].concern.level);
  check("then watch", rows[1].concern.level === "WATCH", rows[1].concern.level);
  check("then calm", rows[2].concern.level === "CALM", rows[2].concern.level);
}

console.log("\n— finished orders leave the screen —");
{
  check("a delivered-and-confirmed order is not live", !isLive({ orderStatus: "DELIVERED", customerConfirmedAt: NOW }));
  check("a delivered-but-unconfirmed one still is", isLive({ orderStatus: "DELIVERED", customerConfirmedAt: null }));
  check("a cancelled one is not", !isLive({ orderStatus: "CANCELLED_BY_UNL", customerConfirmedAt: null }));
  check("an order waiting for a price is", isLive({ orderStatus: "NEW_REQUEST", customerConfirmedAt: null }));
  check("only rider statuses count as on the road", isOutWithRider("ITEM_COLLECTED") && !isOutWithRider("AWAITING_PAYMENT"));
}

console.log("\n— a customer reads the same way twice —");
{
  const facts: CustomerFacts = {
    delivered: 0,
    cancelled: 0,
    complaints: 0,
    openCases: 0,
    lifetimeSpendXaf: 0,
    lastOrderAt: null,
    blockedAt: null,
    createdAt: ago(60),
  };
  check("nobody with no deliveries is a VIP", readCustomer(facts, NOW).tier === "NEW");
  check("a first-timer gets the benefit of the doubt", /generous/i.test(readCustomer(facts, NOW).summary));

  const regular = readCustomer({ ...facts, delivered: 6, lifetimeSpendXaf: 9000, lastOrderAt: ago(60) }, NOW);
  check("six deliveries is a regular", regular.tier === "REGULAR", regular.tier);
  check("and the average is arithmetic, not a guess", regular.averageOrderXaf === 1500, String(regular.averageOrderXaf));

  const vip = readCustomer({ ...facts, delivered: 20, lifetimeSpendXaf: 30000, lastOrderAt: ago(60) }, NOW);
  check("twenty deliveries is a VIP", vip.tier === "VIP");
  check("and the desk is told to find a way", /find a way/i.test(vip.summary), vip.summary);

  const complained = readCustomer({ ...facts, delivered: 5, openCases: 1, lastOrderAt: ago(60) }, NOW);
  check("an unanswered complaint puts them at risk", complained.risk === "AT_RISK", complained.risk);

  const gone = readCustomer(
    { ...facts, delivered: 5, lastOrderAt: new Date(NOW.getTime() - 60 * 86_400_000) },
    NOW
  );
  check("sixty days silent is drifted away", gone.risk === "LAPSED", gone.risk);

  const blocked = readCustomer({ ...facts, delivered: 5, openCases: 1, blockedAt: ago(10) }, NOW);
  check("being blocked outranks everything else", blocked.risk === "BLOCKED", blocked.risk);
  check("and the desk is told to read the reason", /reason/i.test(blocked.summary));

  const flaky = readCustomer({ ...facts, delivered: 2, cancelled: 3, lastOrderAt: ago(60) }, NOW);
  check("a 60% cancel rate is worth watching", flaky.cancelRatePercent === 60 && flaky.risk === "WATCH", flaky.risk);
  check("nobody with no orders divides by zero", readCustomer(facts, NOW).cancelRatePercent === 0);
}

console.log("\n— goodwill has a ceiling —");
{
  check("zero is refused", goodwillProblem(0) !== null);
  check("a negative is refused", goodwillProblem(-500) !== null);
  check("a fraction is refused", goodwillProblem(500.5) !== null);
  check(`${GOODWILL_MAX_XAF} is allowed`, goodwillProblem(GOODWILL_MAX_XAF) === null);
  check("one more than the ceiling is not", goodwillProblem(GOODWILL_MAX_XAF + 1) !== null);
  check("and the refusal says the limit", (goodwillProblem(50_000) ?? "").includes(String(GOODWILL_MAX_XAF)));
}

console.log("\n— a watch link is safe to forward, and dies on time —");
{
  const token = createWatchToken("UNL-12345");
  const claim = readWatchToken(token, NOW);
  check("a fresh link reads back", claim?.code === "UNL-12345", JSON.stringify(claim));

  check("a tampered payload is refused", readWatchToken(`x${token}`, NOW) === null);
  check("a tampered signature is refused", readWatchToken(`${token.split(".")[0]}.deadbeef`, NOW) === null);
  check("nonsense is refused", readWatchToken("not-a-token", NOW) === null);
  check("an empty string is refused", readWatchToken("", NOW) === null);

  // The expiry is inside the signature, so it cannot be pushed out by editing
  // the URL. Swapping in a later expiry must break the signature.
  const [payload, signature] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  decoded.exp = decoded.exp + 86_400_000;
  const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
  check("the expiry cannot be extended by hand", readWatchToken(forged, NOW) === null);

  const short = createWatchToken("UNL-12345", 1000);
  check("a link past its expiry is dead", readWatchToken(short, new Date(Date.now() + 5000)) === null);

  // Nothing private is inside the token itself.
  check("the token carries only a code and an expiry", Object.keys(decoded).sort().join() === "code,exp", Object.keys(decoded).join());
}

console.log("\n— and stops watching once the night is over —");
{
  const live = { customerConfirmedAt: null, completedAt: null, orderStatus: "RIDER_GOING_TO_DELIVERY" };
  check("open while the delivery is running", watchWindowOpen(live, NOW));

  const justArrived = { customerConfirmedAt: ago(10), completedAt: ago(10), orderStatus: "DELIVERED" };
  check("still open ten minutes after the knock", watchWindowOpen(justArrived, NOW));

  const oldNews = { customerConfirmedAt: ago(120), completedAt: ago(120), orderStatus: "DELIVERED" };
  check("shut two hours later", !watchWindowOpen(oldNews, NOW));

  const cancelled = { customerConfirmedAt: null, completedAt: null, orderStatus: "CANCELLED_BY_UNL" };
  check("shut the moment an order is cancelled", !watchWindowOpen(cancelled, NOW));
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
