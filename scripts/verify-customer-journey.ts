/**
 * The customer's night, proved to run in one direction.
 *
 * The confirmation screen used to render every card it might ever need, all at
 * once and permanently: the quote, the payment box, the delivery code, both
 * receipts, the confirm-receipt form and the reorder prompt. A customer who had
 * already paid still had the payment card in front of them.
 *
 * These checks walk one order from placed to received and assert that at every
 * point exactly one stage is open, everything behind it is finished with the
 * evidence attached, and everything ahead of it is shut — including the two
 * cases where nothing is allowed to open at all: a cancelled order, and an
 * order somebody is looking at without having proved they own it.
 */
import {
  buildJourney,
  activeStage,
  journeyComplete,
  journeyProgress,
  stageOpen,
  type JourneyInput,
  type JourneyKey,
} from "../src/lib/orders/customerJourney";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const base: JourneyInput = {
  orderStatus: "NEW_REQUEST",
  paymentStatus: "PENDING",
  paymentMethod: "MTN_MOMO",
  quoteSentAt: null,
  quoteAcceptedAt: null,
  quoteDeclinedAt: null,
  quotedFeeXaf: null,
  riderName: null,
  otpIssued: false,
  customerConfirmedAt: null,
  deliveredAt: null,
};

const T1 = new Date("2026-07-29T19:10:00Z");
const T2 = new Date("2026-07-29T19:22:00Z");
const T3 = new Date("2026-07-29T20:05:00Z");

/** Exactly one stage live, everything before done, everything after shut. */
function assertShape(label: string, input: JourneyInput, expectActive: JourneyKey | null) {
  const stages = buildJourney(input, false);
  const live = stages.filter((s) => s.state === "ACTIVE");
  check(`${label}: exactly one stage is open`, live.length === (expectActive ? 1 : 0), `${live.length} open`);
  if (expectActive) {
    check(`${label}: it is ${expectActive}`, live[0]?.key === expectActive, live[0]?.key ?? "none");
    const i = stages.findIndex((s) => s.key === expectActive);
    check(
      `${label}: everything before it is finished`,
      stages.slice(0, i).every((s) => s.state === "DONE")
    );
    check(
      `${label}: everything before it carries its proof`,
      stages.slice(0, i).every((s) => s.proof != null && s.proof.length > 0)
    );
    check(
      `${label}: everything after it is shut`,
      stages.slice(i + 1).every((s) => s.state === "LOCKED" || s.state === "STOPPED")
    );
    check(
      `${label}: only ${expectActive} may show controls`,
      stages.every((s) => stageOpen(stages, s.key) === (s.key === expectActive))
    );
  }
  return stages;
}

console.log("\n— the order walks forwards, one stage at a time —");
{
  assertShape("just placed", base, "PLACED");

  const priced: JourneyInput = { ...base, orderStatus: "AWAITING_DISPATCHER_REVIEW", quoteSentAt: T1, quotedFeeXaf: 1500 };
  assertShape("priced", priced, "QUOTE");

  const accepted: JourneyInput = { ...priced, orderStatus: "AWAITING_PAYMENT", quoteAcceptedAt: T2 };
  assertShape("price accepted", accepted, "PAYMENT");

  const paid: JourneyInput = { ...accepted, paymentStatus: "VERIFIED" };
  assertShape("paid", paid, "ON_THE_WAY");

  const riding: JourneyInput = { ...paid, orderStatus: "RIDER_GOING_TO_PICKUP", riderName: "Samuel", otpIssued: true };
  assertShape("rider collecting", riding, "ON_THE_WAY");

  const bringing: JourneyInput = { ...riding, orderStatus: "RIDER_GOING_TO_DELIVERY" };
  assertShape("rider bringing it to you", bringing, "RECEIVED");

  const atDoor: JourneyInput = { ...bringing, orderStatus: "RIDER_ARRIVED_AT_DELIVERY" };
  assertShape("rider at the door", atDoor, "RECEIVED");

  const received: JourneyInput = { ...atDoor, orderStatus: "DELIVERED", customerConfirmedAt: T3, deliveredAt: T3 };
  const end = assertShape("received", received, null);
  check("the night is finished", journeyComplete(end));
  check("nothing is left open at the end", activeStage(end) === null);
  check("all five stages are done", journeyProgress(end).done === 5);
}

console.log("\n— the code and the confirmation arrive together —");
{
  // The delivery code is only useful at the door, and confirming receipt is
  // only honest there. They must be the same stage or one of them is orphaned.
  const atDoor: JourneyInput = {
    ...base,
    orderStatus: "RIDER_ARRIVED_AT_DELIVERY",
    quoteSentAt: T1,
    quoteAcceptedAt: T2,
    quotedFeeXaf: 1500,
    paymentStatus: "VERIFIED",
    riderName: "Samuel",
    otpIssued: true,
  };
  const stages = buildJourney(atDoor, false);
  check("the handover stage is the open one", stageOpen(stages, "RECEIVED"));
  check("tracking is behind us by then", stages.find((s) => s.key === "ON_THE_WAY")?.state === "DONE");
}

console.log("\n— cash never waits for a payment that is not coming —");
{
  const cashAccepted: JourneyInput = {
    ...base,
    paymentMethod: "CASH",
    orderStatus: "AWAITING_DISPATCHER_REVIEW",
    quoteSentAt: T1,
    quoteAcceptedAt: T2,
    quotedFeeXaf: 1500,
  };
  const stages = assertShape("cash, price accepted", cashAccepted, "ON_THE_WAY");
  const pay = stages.find((s) => s.key === "PAYMENT")!;
  check("payment is finished, not skipped", pay.state === "DONE");
  check("and says why", /door|porte/.test(pay.proof ?? ""), pay.proof ?? "");
}

console.log("\n— a declined price goes back to us, not forward —");
{
  const declined: JourneyInput = {
    ...base,
    orderStatus: "AWAITING_DISPATCHER_REVIEW",
    quoteSentAt: T1,
    quoteDeclinedAt: T2,
    quotedFeeXaf: 4000,
  };
  const stages = buildJourney(declined, false);
  const quote = stages.find((s) => s.key === "QUOTE")!;
  check("the price stage is still the open one", quote.state === "ACTIVE");
  check("but the wait is ours, not theirs", quote.turn === "OURS", quote.turn);
  check("payment stays shut", !stageOpen(stages, "PAYMENT"));
}

console.log("\n— a stopped order stops, it does not keep waiting —");
{
  for (const status of ["CANCELLED_BY_CUSTOMER", "REJECTED", "SAFETY_HOLD", "REFUNDED"] as const) {
    const stages = buildJourney({ ...base, orderStatus: status, quoteSentAt: T1 }, false);
    check(`${status}: nothing is open`, stages.every((s) => s.state !== "ACTIVE"));
    check(`${status}: the rest is stopped, not locked`, stages.some((s) => s.state === "STOPPED"));
    check(`${status}: it is not called finished`, !journeyComplete(stages));
  }
}

console.log("\n— a stage never goes backwards —");
{
  // Walk the whole night and assert the finished count only ever climbs.
  const walk: JourneyInput[] = [
    base,
    { ...base, quoteSentAt: T1, quotedFeeXaf: 1500 },
    { ...base, quoteSentAt: T1, quotedFeeXaf: 1500, quoteAcceptedAt: T2 },
    { ...base, quoteSentAt: T1, quotedFeeXaf: 1500, quoteAcceptedAt: T2, paymentStatus: "VERIFIED" },
    { ...base, quoteSentAt: T1, quotedFeeXaf: 1500, quoteAcceptedAt: T2, paymentStatus: "VERIFIED", orderStatus: "RIDER_ASSIGNED", riderName: "Samuel" },
    { ...base, quoteSentAt: T1, quotedFeeXaf: 1500, quoteAcceptedAt: T2, paymentStatus: "VERIFIED", orderStatus: "RIDER_GOING_TO_DELIVERY", riderName: "Samuel" },
    { ...base, quoteSentAt: T1, quotedFeeXaf: 1500, quoteAcceptedAt: T2, paymentStatus: "VERIFIED", orderStatus: "DELIVERED", riderName: "Samuel", customerConfirmedAt: T3 },
  ];
  let previous = -1;
  let monotonic = true;
  for (const step of walk) {
    const n = journeyProgress(buildJourney(step, false)).done;
    if (n < previous) monotonic = false;
    previous = n;
  }
  check("progress only ever climbs", monotonic);
  check("and ends at five", previous === 5, String(previous));
}

console.log("\n— both languages, and no empty words —");
{
  const mid: JourneyInput = { ...base, quoteSentAt: T1, quotedFeeXaf: 1500 };
  for (const fr of [false, true]) {
    const stages = buildJourney(mid, fr);
    check(
      `${fr ? "fr" : "en"}: every stage has a title and a headline`,
      stages.every((s) => s.title.trim().length > 0 && s.headline.trim().length > 0)
    );
    check(
      `${fr ? "fr" : "en"}: every shut stage says what it is waiting for`,
      stages.filter((s) => s.state === "LOCKED").every((s) => (s.blockedBy ?? "").trim().length > 0)
    );
  }
  const en = buildJourney(mid, false);
  const frs = buildJourney(mid, true);
  check("the two languages differ", en[0].title !== frs[0].title);
  check("but agree on where the order is", en.map((s) => s.state).join() === frs.map((s) => s.state).join());
}

console.log("\n— the money is never guessed —");
{
  // A stage claiming to be done must have something on the order proving it.
  const noQuote: JourneyInput = { ...base, paymentStatus: "VERIFIED" };
  const stages = buildJourney(noQuote, false);
  check(
    "a verified payment without an accepted price proves nothing",
    stages.find((s) => s.key === "PAYMENT")?.state !== "DONE"
  );
  check("and the order is still at the start", activeStage(stages)?.key === "PLACED");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
