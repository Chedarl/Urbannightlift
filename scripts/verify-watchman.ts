/**
 * Proves what the watchman will and will not wake somebody up for.
 *
 * `concernOf` already knew what a stalled order looks like, and
 * `/api/admin/live` rendered it well — but only while a human had the console
 * open. On an unwatched night an order could sit unpriced from 11 PM until
 * somebody opened a laptop, and the first person to notice was the customer.
 * The watchman closes that, and the risk it introduces is the opposite one:
 *
 * **A watchman that cries every ten minutes is worse than no watchman**, because
 * it teaches dispatch to swipe alerts away, and then the real one arrives into
 * a habit of ignoring alerts.
 *
 * So the checks below are mostly about *restraint* — what it stays quiet for —
 * and about the thresholds being the shared constants rather than numbers typed
 * a second time.
 *
 * Run: npx tsx scripts/verify-watchman.ts
 */
import {
  concernOf,
  isLive,
  SLOW_REVIEW_MS,
  SLOW_PAYMENT_MS,
  SLOW_UNASSIGNED_MS,
  TRACKING_LOST_MS,
  type LiveOrderInput,
} from "../src/lib/orders/liveWatch";
import { REALERT_MS } from "../src/lib/orders/watchman";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
}

const NOW = new Date("2026-08-11T01:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function order(over: Partial<LiveOrderInput> = {}): LiveOrderInput {
  return {
    orderStatus: "AWAITING_DISPATCHER_REVIEW",
    createdAt: ago(60_000),
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
    ...over,
  };
}

const level = (o: LiveOrderInput) => concernOf(o, NOW).level;

console.log("\nIt stays quiet about a healthy night");
check("an order a minute old is calm", level(order()) !== "URGENT");
check(
  "an order still inside the review window is not urgent",
  level(order({ createdAt: ago(SLOW_REVIEW_MS - 60_000) })) !== "URGENT"
);
check(
  "a rider whose position came in a moment ago is calm",
  level(
    order({
      orderStatus: "RIDER_GOING_TO_DELIVERY",
      assignedRiderId: "r1",
      riderAcceptedAt: ago(5 * 60_000),
      riderLocationAt: ago(30_000),
      riderLat: 3.89,
      riderLng: 11.51,
    })
  ) === "CALM"
);

console.log("\nAnd raises its hand for the things that actually cost a customer");
check(
  "an order left unpriced past the threshold is urgent",
  level(order({ createdAt: ago(SLOW_REVIEW_MS + 60_000) })) === "URGENT",
  "this is the one that sat from 11 PM until somebody opened a laptop"
);
check(
  "a customer who says they have paid, unchecked, is urgent",
  level(
    order({
      orderStatus: "PAYMENT_SUBMITTED",
      paymentStatus: "SUBMITTED_UNVERIFIED",
      quoteSentAt: ago(10 * 60_000),
      quoteAcceptedAt: ago(9 * 60_000),
    })
  ) === "URGENT",
  "their money has left their account and nobody has looked"
);
check(
  "but a customer who simply has not paid yet is only a WATCH",
  level(
    order({
      orderStatus: "AWAITING_PAYMENT",
      quoteSentAt: ago(SLOW_PAYMENT_MS + 120_000),
      quoteAcceptedAt: ago(SLOW_PAYMENT_MS + 60_000),
      createdAt: ago(SLOW_PAYMENT_MS + 180_000),
    })
  ) === "WATCH",
  "chasing somebody who has not paid is a phone call in the morning, not a 2 AM alarm — and since the watchman only pushes URGENT, this stays off dispatch's lock screen"
);
check(
  "a rider who has not accepted their assignment is urgent",
  level(
    order({
      orderStatus: "RIDER_ASSIGNED",
      paymentStatus: "VERIFIED",
      quoteSentAt: ago(40 * 60_000),
      quoteAcceptedAt: ago(39 * 60_000),
      assignedRiderId: "r1",
      assignedAt: ago(15 * 60_000),
    })
  ) === "URGENT",
  "everyone assumes somebody else has it"
);
check(
  "a paid order nobody has assigned is urgent",
  level(
    order({
      orderStatus: "PAYMENT_VERIFIED",
      paymentStatus: "VERIFIED",
      quoteSentAt: ago(SLOW_UNASSIGNED_MS + 300_000),
      quoteAcceptedAt: ago(SLOW_UNASSIGNED_MS + 240_000),
      createdAt: ago(SLOW_UNASSIGNED_MS + 360_000),
    })
  ) === "URGENT",
  "the exact case that has no automation behind it — it sits until a person notices"
);
check(
  "a rider whose phone stopped reporting is urgent",
  level(
    order({
      orderStatus: "RIDER_GOING_TO_DELIVERY",
      assignedRiderId: "r1",
      riderAcceptedAt: ago(20 * 60_000),
      riderLocationAt: ago(TRACKING_LOST_MS + 60_000),
      riderLat: 3.89,
      riderLng: 11.51,
    })
  ) === "URGENT",
  "somebody is out there on a bike and we have lost them"
);

console.log("\nEvery urgent concern tells a person what to do about it");
for (const o of [
  order({ createdAt: ago(SLOW_REVIEW_MS + 60_000) }),
  order({
    orderStatus: "RIDER_GOING_TO_DELIVERY",
    assignedRiderId: "r1",
    riderAcceptedAt: ago(20 * 60_000),
    riderLocationAt: ago(TRACKING_LOST_MS + 60_000),
    riderLat: 3.89,
    riderLng: 11.51,
  }),
]) {
  const c = concernOf(o, NOW);
  check(`"${c.message}" carries an action`, c.action.trim().length > 0, "an alert with nothing to do about it is noise");
  check(`and reads as a sentence, not a code`, /[a-z]/.test(c.message) && c.message.length > 12);
}

console.log("\nFinished orders are nobody's problem");
for (const status of ["DELIVERED", "CLOSED", "CANCELLED_BY_CUSTOMER", "REFUNDED"] as const) {
  const done = { orderStatus: status, customerConfirmedAt: NOW };
  check(`${status} is not live`, !isLive(done), "waking somebody about a finished order is how alerts stop being read");
}
check(
  "except a delivery the customer has not confirmed, which still is",
  isLive({ orderStatus: "DELIVERED", customerConfirmedAt: null })
);

console.log("\nThe once-an-hour rule is a real hour");
check("re-alerting is bounded to an hour", REALERT_MS === 60 * 60_000, String(REALERT_MS));
check(
  "which is comfortably longer than the cron interval",
  REALERT_MS >= 6 * 10 * 60_000,
  "ten-minute rounds with a shorter memory would push the same alert six times an hour"
);

console.log(
  `\n${failures === 0 ? "It wakes somebody for the things worth waking them for, and stays quiet otherwise." : `${failures} check(s) FAILED.`}\n`
);
process.exit(failures === 0 ? 0 : 1);
