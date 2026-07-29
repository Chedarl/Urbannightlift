import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { isPayOnDelivery } from "@/lib/orders/dispatchRules";
import { formatXaf } from "@/lib/utils";

/**
 * The order of work, and the proof that each part of it is finished.
 *
 * The dispatch console used to show every step as permanently open. A delivered,
 * paid, confirmed order still offered "Approve order", "Update price",
 * "Confirm payment" and "Assign rider" as live buttons — so nothing on the
 * screen distinguished a step that had been done from one that had not, and
 * there was no way to look at an order and know it had been handled properly
 * rather than half-handled in an unpredictable order.
 *
 * This turns the order into six steps that each hold one of three positions:
 * locked because the step before it is unfinished, active because it is what
 * somebody should be doing now, or done — with the evidence attached, in
 * writing: what happened, and when.
 *
 * A step going backwards is deliberately not possible here. Reopening one is a
 * separate, audited act, not a side effect of a button still being on screen.
 */

export type StepKey = "REVIEW" | "QUOTE" | "PAYMENT" | "DISPATCH" | "PROOF" | "SETTLE";

export type StepState =
  /** The step before this one is unfinished. Nothing here can be touched. */
  | "LOCKED"
  /** This is the work in front of you. */
  | "ACTIVE"
  /** Finished, with evidence. Controls are put away. */
  | "DONE"
  /** The order was cancelled, rejected or held before reaching this step. */
  | "STOPPED";

export interface WorkflowInput {
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  approvedAt: Date | null;
  quoteSentAt: Date | null;
  quoteAcceptedAt: Date | null;
  quoteDeclinedAt: Date | null;
  quotedFeeXaf: number | null;
  paymentVerifiedAt: Date | null;
  paymentVerifiedBy: string | null;
  assignedRiderId: string | null;
  assignedRiderName: string | null;
  assignedAt: Date | null;
  riderAcceptedAt: Date | null;
  otpIssued: boolean;
  deliveryProofCount: number;
  customerConfirmedAt: Date | null;
  completedAt: Date | null;
  /** Cash orders are only truly finished once the rider hands the money in. */
  cashSettledAt: Date | null;
}

export interface WorkflowStep {
  key: StepKey;
  number: number;
  title: string;
  /** One line saying what this step is for. */
  purpose: string;
  state: StepState;
  /** When DONE: what happened, in plain words. This is the proof. */
  proof: string | null;
  completedAt: Date | null;
  /** When LOCKED: what has to happen first. */
  blockedBy: string | null;
}

const STOPPED_STATUSES: OrderStatus[] = [
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "REJECTED",
  "FAILED_DELIVERY",
  "REFUND_PENDING",
  "REFUNDED",
  "SAFETY_HOLD",
];

const when = (d: Date | null): string =>
  d
    ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

/**
 * The six steps, in the only order they are allowed to happen.
 *
 * Each step is decided only by evidence already on the order, so this cannot
 * disagree with what actually took place.
 */
export function buildWorkflow(o: WorkflowInput): WorkflowStep[] {
  const stopped = STOPPED_STATUSES.includes(o.orderStatus);
  const payOnDelivery = isPayOnDelivery(o.paymentMethod);

  // Each step is finished when there is something on the record proving it.
  const reviewDone = o.approvedAt != null;
  const quoteDone = o.quoteAcceptedAt != null;
  const paymentDone = quoteDone && (o.paymentStatus === "VERIFIED" || payOnDelivery);
  const dispatchDone = o.riderAcceptedAt != null && o.assignedRiderId != null;
  const proofDone = o.customerConfirmedAt != null || o.deliveryProofCount > 0;
  const settleDone =
    o.orderStatus === "CLOSED" || (o.completedAt != null && (!payOnDelivery || o.cashSettledAt != null));

  const steps: Omit<WorkflowStep, "state">[] = [
    {
      key: "REVIEW",
      number: 1,
      title: "Review and approve",
      purpose: "Decide whether we take this order at all. Nothing is priced until it is approved.",
      proof: reviewDone ? `Approved ${when(o.approvedAt)}` : null,
      completedAt: o.approvedAt,
      blockedBy: null,
    },
    {
      key: "QUOTE",
      number: 2,
      title: "Price it and get it accepted",
      purpose: "Send the customer a price. They must accept it before anything else moves.",
      proof: quoteDone
        ? `Customer accepted ${o.quotedFeeXaf != null ? `${formatXaf(o.quotedFeeXaf)} ` : ""}${when(o.quoteAcceptedAt)}`
        : null,
      completedAt: o.quoteAcceptedAt,
      blockedBy: reviewDone ? null : "Approve the order first.",
    },
    {
      key: "PAYMENT",
      number: 3,
      title: "Take the money",
      purpose: "No rider leaves until the money is in — except on cash, where it arrives at the door.",
      proof: paymentDone
        ? payOnDelivery
          ? "Cash on delivery — collected by the rider at the door"
          : `Verified ${when(o.paymentVerifiedAt)}${o.paymentVerifiedBy ? ` by ${o.paymentVerifiedBy}` : ""}`
        : null,
      completedAt: payOnDelivery ? o.quoteAcceptedAt : o.paymentVerifiedAt,
      blockedBy: quoteDone ? null : "The customer has not accepted the price yet.",
    },
    {
      key: "DISPATCH",
      number: 4,
      title: "Send a rider",
      purpose: "Assign a rider. Their acceptance is what issues the customer's delivery code.",
      proof: dispatchDone
        ? `${o.assignedRiderName ?? "Rider"} accepted ${when(o.riderAcceptedAt)}${o.otpIssued ? " · delivery code issued" : ""}`
        : null,
      completedAt: o.riderAcceptedAt,
      blockedBy: paymentDone
        ? null
        : payOnDelivery
          ? "The customer has not accepted the price yet."
          : "The payment has not been verified.",
    },
    {
      key: "PROOF",
      number: 5,
      title: "Prove it arrived",
      purpose: "The rider's proof and the customer's own confirmation. Both sides of the handover.",
      proof: proofDone
        ? [
            o.deliveryProofCount > 0 ? `${o.deliveryProofCount} proof from the rider` : null,
            o.customerConfirmedAt ? `customer confirmed ${when(o.customerConfirmedAt)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
      completedAt: o.customerConfirmedAt,
      blockedBy: dispatchDone ? null : "No rider has accepted this order yet.",
    },
    {
      key: "SETTLE",
      number: 6,
      title: "Close the books",
      purpose: "Rider earnings, cash handed in, and the order marked finished.",
      proof: settleDone
        ? payOnDelivery && o.cashSettledAt
          ? `Cash handed in ${when(o.cashSettledAt)}`
          : `Completed ${when(o.completedAt)}`
        : null,
      completedAt: o.completedAt,
      blockedBy: proofDone ? null : "Delivery has not been proved yet.",
    },
  ];

  const doneFlags = [reviewDone, quoteDone, paymentDone, dispatchDone, proofDone, settleDone];

  return steps.map((step, i) => {
    if (doneFlags[i]) return { ...step, state: "DONE" as const };
    // A stopped order freezes wherever it got to — the remaining steps are not
    // waiting for anybody, they are never happening.
    if (stopped) return { ...step, state: "STOPPED" as const };
    // The first unfinished step whose predecessor is done is the live one.
    const previousDone = i === 0 || doneFlags[i - 1];
    return { ...step, state: previousDone ? ("ACTIVE" as const) : ("LOCKED" as const) };
  });
}

/** The step somebody should be working on right now, if any. */
export function activeStep(steps: WorkflowStep[]): WorkflowStep | null {
  return steps.find((s) => s.state === "ACTIVE") ?? null;
}

/** How far along, for a progress readout. */
export function completedCount(steps: WorkflowStep[]): number {
  return steps.filter((s) => s.state === "DONE").length;
}

/**
 * Whether an action belonging to a step may run.
 *
 * The console hides controls on steps that are locked or done, but a hidden
 * button is not a closed door — this is the check the API routes use so the
 * sequence holds even against a hand-made request.
 */
export function canActOn(steps: WorkflowStep[], key: StepKey): { allowed: boolean; reason?: string } {
  const step = steps.find((s) => s.key === key);
  if (!step) return { allowed: false, reason: "Unknown step" };
  if (step.state === "ACTIVE") return { allowed: true };
  if (step.state === "DONE") {
    return { allowed: false, reason: `Step ${step.number} (${step.title}) is already finished.` };
  }
  if (step.state === "STOPPED") {
    return { allowed: false, reason: "This order is cancelled or on hold." };
  }
  return { allowed: false, reason: step.blockedBy ?? `Step ${step.number} cannot be started yet.` };
}
