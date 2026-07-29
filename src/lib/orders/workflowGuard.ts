import "server-only";

import { prisma } from "@/lib/prisma";
import { buildWorkflow, canActOn, type StepKey, type WorkflowStep } from "@/lib/orders/workflow";

/**
 * The workflow, loaded from the database and enforced.
 *
 * The console hides controls on steps that are locked or already finished, but
 * a hidden button is not a closed door. Every route that advances an order asks
 * this first, so the sequence survives a stale tab, a double tap, two
 * dispatchers working the same order, or a hand-made request.
 */

/** Everything `buildWorkflow` needs, read in one query. */
export async function loadWorkflow(orderId: string): Promise<WorkflowStep[] | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderStatus: true,
      paymentStatus: true,
      paymentMethod: true,
      approvedAt: true,
      quoteSentAt: true,
      quoteAcceptedAt: true,
      quoteDeclinedAt: true,
      quotedFeeXaf: true,
      assignedRiderId: true,
      assignedAt: true,
      riderAcceptedAt: true,
      otpCode: true,
      customerConfirmedAt: true,
      completedAt: true,
      cashSettledAt: true,
      assignedRider: { select: { fullName: true } },
      payments: {
        where: { verifiedAt: { not: null } },
        orderBy: { verifiedAt: "desc" },
        take: 1,
        select: { verifiedAt: true, verifiedById: true },
      },
      deliveryProofs: { where: { stage: "DELIVERY" }, select: { id: true } },
    },
  });
  if (!order) return null;

  const verified = order.payments[0];
  // Payment.verifiedById is a plain column rather than a relation, so the name
  // behind it takes one more read. Worth it: "verified by whom" is the whole
  // point of recording it.
  const verifier = verified?.verifiedById
    ? await prisma.user.findUnique({ where: { id: verified.verifiedById }, select: { fullName: true } })
    : null;

  return buildWorkflow({
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    approvedAt: order.approvedAt,
    quoteSentAt: order.quoteSentAt,
    quoteAcceptedAt: order.quoteAcceptedAt,
    quoteDeclinedAt: order.quoteDeclinedAt,
    quotedFeeXaf: order.quotedFeeXaf,
    paymentVerifiedAt: verified?.verifiedAt ?? null,
    paymentVerifiedBy: verifier?.fullName ?? null,
    assignedRiderId: order.assignedRiderId,
    assignedRiderName: order.assignedRider?.fullName ?? null,
    assignedAt: order.assignedAt,
    riderAcceptedAt: order.riderAcceptedAt,
    otpIssued: order.otpCode != null,
    deliveryProofCount: order.deliveryProofs.length,
    customerConfirmedAt: order.customerConfirmedAt,
    completedAt: order.completedAt,
    cashSettledAt: order.cashSettledAt,
  });
}

/**
 * Refuses an action that belongs to a step which is not the live one.
 *
 * Returns null when the action may proceed, or a message explaining what has to
 * happen first — written for the dispatcher who will read it, not for a log.
 */
export async function guardStep(orderId: string, step: StepKey): Promise<string | null> {
  const steps = await loadWorkflow(orderId);
  if (!steps) return "That order no longer exists.";
  const verdict = canActOn(steps, step);
  return verdict.allowed ? null : (verdict.reason ?? "That step cannot be done yet.");
}
