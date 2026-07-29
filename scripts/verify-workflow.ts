/**
 * The order of work, proved.
 *
 * The console used to leave every step open forever: a delivered, paid,
 * confirmed order still offered "Approve order", "Update price", "Confirm
 * payment" and "Assign rider" as live buttons. Nothing distinguished a step
 * that had been done from one that had not.
 *
 * These checks walk a real order from arrival to closing and assert that at
 * each point exactly one step is live, everything before it is finished with
 * evidence attached, and everything after it is locked.
 */
import { buildWorkflow, activeStep, canActOn, completedCount, type WorkflowInput } from "../src/lib/orders/workflow";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const t = (min: number) => new Date(Date.UTC(2026, 6, 29, 16, min));

const fresh: WorkflowInput = {
  orderStatus: "AWAITING_DISPATCHER_REVIEW",
  paymentStatus: "PENDING",
  paymentMethod: "MTN_MOMO",
  approvedAt: null,
  quoteSentAt: null,
  quoteAcceptedAt: null,
  quoteDeclinedAt: null,
  quotedFeeXaf: null,
  paymentVerifiedAt: null,
  paymentVerifiedBy: null,
  assignedRiderId: null,
  assignedRiderName: null,
  assignedAt: null,
  riderAcceptedAt: null,
  otpIssued: false,
  deliveryProofCount: 0,
  customerConfirmedAt: null,
  completedAt: null,
  cashSettledAt: null,
};

/** Exactly one step live, the right one, with the right things locked. */
function expectShape(label: string, o: WorkflowInput, liveKey: string | null, doneCount: number) {
  const steps = buildWorkflow(o);
  const live = activeStep(steps);
  check(`${label}: live step is ${liveKey ?? "none"}`, (live?.key ?? null) === liveKey, `got ${live?.key ?? "none"}`);
  check(`${label}: ${doneCount} step(s) finished`, completedCount(steps) === doneCount, `got ${completedCount(steps)}`);
  const active = steps.filter((s) => s.state === "ACTIVE");
  check(`${label}: never two steps live at once`, active.length <= 1, `got ${active.length}`);
  // Nothing after the live step may be reachable.
  if (live) {
    const after = steps.filter((s) => s.number > live.number);
    check(
      `${label}: everything after is locked`,
      after.every((s) => s.state === "LOCKED"),
      after.map((s) => `${s.key}=${s.state}`).join(",")
    );
  }
  return steps;
}

console.log("\n— an order walks the whole way —");

let o = { ...fresh };
let steps = expectShape("just arrived", o, "REVIEW", 0);
check("cannot price it yet", !canActOn(steps, "QUOTE").allowed);
check("and is told why", canActOn(steps, "QUOTE").reason === "Approve the order first.", canActOn(steps, "QUOTE").reason);
check("cannot dispatch from a standing start", !canActOn(steps, "DISPATCH").allowed);

o = { ...o, approvedAt: t(0), orderStatus: "APPROVED" };
steps = expectShape("approved", o, "QUOTE", 1);
check("approval left proof", steps[0].proof?.startsWith("Approved") === true, String(steps[0].proof));
check("approving again is refused", !canActOn(steps, "REVIEW").allowed);
check("and says it is already finished", /already finished/.test(canActOn(steps, "REVIEW").reason ?? ""));

o = { ...o, quoteSentAt: t(5), quotedFeeXaf: 1500 };
steps = expectShape("price sent, not answered", o, "QUOTE", 1);
check("payment still locked while the price is unanswered", !canActOn(steps, "PAYMENT").allowed);

o = { ...o, quoteAcceptedAt: t(8) };
steps = expectShape("customer accepted", o, "PAYMENT", 2);
check(
  "the accepted price is on the record",
  /1.500 XAF/.test(steps[1].proof ?? ""),
  String(steps[1].proof)
);
check("still cannot send a rider", !canActOn(steps, "DISPATCH").allowed);
check(
  "and says the money is the reason",
  canActOn(steps, "DISPATCH").reason === "The payment has not been verified.",
  canActOn(steps, "DISPATCH").reason
);

o = { ...o, paymentStatus: "VERIFIED", paymentVerifiedAt: t(12), paymentVerifiedBy: "Che" };
steps = expectShape("payment verified", o, "DISPATCH", 3);
check("who verified it is recorded", steps[2].proof?.includes("by Che") === true, String(steps[2].proof));

o = {
  ...o,
  orderStatus: "RIDER_ASSIGNED",
  assignedRiderId: "r1",
  assignedRiderName: "UNL Rider One",
  assignedAt: t(14),
  riderAcceptedAt: t(15),
  otpIssued: true,
};
steps = expectShape("rider accepted", o, "PROOF", 4);
check("the rider and the code are on the record", steps[3].proof?.includes("delivery code issued") === true, String(steps[3].proof));
check("cannot re-assign a rider now", !canActOn(steps, "DISPATCH").allowed);

o = { ...o, orderStatus: "DELIVERED", deliveryProofCount: 1, customerConfirmedAt: t(40) };
steps = expectShape("delivered and confirmed", o, "SETTLE", 5);
check("both sides of the handover are recorded", steps[4].proof?.includes("customer confirmed") === true, String(steps[4].proof));

o = { ...o, orderStatus: "CLOSED", completedAt: t(45) };
steps = buildWorkflow(o);
check("closed: all six finished", completedCount(steps) === 6, String(completedCount(steps)));
check("closed: nothing is live", activeStep(steps) === null);
check("closed: approving is refused", !canActOn(steps, "REVIEW").allowed);
check("closed: re-pricing is refused", !canActOn(steps, "QUOTE").allowed);
check("closed: confirming payment again is refused", !canActOn(steps, "PAYMENT").allowed);
check("closed: assigning a rider is refused", !canActOn(steps, "DISPATCH").allowed);

console.log("\n— cash is settled at the door, not before —");
let cash: WorkflowInput = {
  ...fresh,
  paymentMethod: "CASH",
  orderStatus: "APPROVED",
  approvedAt: t(0),
  quoteSentAt: t(2),
  quoteAcceptedAt: t(4),
  quotedFeeXaf: 1500,
};
steps = expectShape("cash, price accepted", cash, "DISPATCH", 3);
check(
  "cash counts as paid without a transfer",
  steps[2].proof === "Cash on delivery — collected by the rider at the door",
  String(steps[2].proof)
);
check("so a rider can go", canActOn(steps, "DISPATCH").allowed);

cash = {
  ...cash,
  orderStatus: "DELIVERED",
  assignedRiderId: "r1",
  assignedRiderName: "Rider",
  riderAcceptedAt: t(10),
  deliveryProofCount: 1,
  customerConfirmedAt: t(30),
  completedAt: t(31),
};
steps = buildWorkflow(cash);
check("a cash order is NOT closed until the money is handed in", completedCount(steps) === 5, String(completedCount(steps)));
check("and settling is what is live", activeStep(steps)?.key === "SETTLE", activeStep(steps)?.key);

cash = { ...cash, cashSettledAt: t(60) };
steps = buildWorkflow(cash);
check("handing the cash in closes it", completedCount(steps) === 6, String(completedCount(steps)));

console.log("\n— a stopped order freezes where it got to —");
const held: WorkflowInput = { ...fresh, orderStatus: "SAFETY_HOLD", approvedAt: t(0) };
steps = buildWorkflow(held);
check("the finished step stays finished", steps[0].state === "DONE");
check("nothing is live", activeStep(steps) === null);
check("the rest read as stopped", steps.slice(1).every((s) => s.state === "STOPPED"));
check("and no action is allowed", !canActOn(steps, "QUOTE").allowed && !canActOn(steps, "DISPATCH").allowed);

console.log("\n— a declined price does not count as accepted —");
const declined: WorkflowInput = {
  ...fresh,
  orderStatus: "APPROVED",
  approvedAt: t(0),
  quoteSentAt: t(2),
  quoteDeclinedAt: t(3),
  quotedFeeXaf: 3000,
};
steps = expectShape("price declined", declined, "QUOTE", 1);
check("payment stays locked after a decline", !canActOn(steps, "PAYMENT").allowed);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
