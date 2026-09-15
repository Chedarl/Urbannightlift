import "server-only";

import type { OrderStatus, ServiceType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SHOPPING_SERVICES, orderMoney } from "@/lib/orders/goodsMoney";
import { checkReceipt } from "@/lib/orders/receiptCheck";

/**
 * What is wrong tonight, decided in one place.
 *
 * This lived inside `/admin/dashboard/page.tsx`, which was fine while exactly
 * one screen asked the question. The staff assistant asks the same question, and
 * two copies of "what needs attention" is how a dispatcher ends up being told
 * one thing by the panel and another by the chat — about the same order, on the
 * same screen, at 2 AM.
 *
 * So the query, the columns and the classifier all live here, and both callers
 * read them. Nothing about the behaviour changes; it simply cannot drift.
 *
 * The ordering of the classifier is the load-bearing part and is unchanged:
 * money already spent and refused outranks everything, because nobody but
 * dispatch can move it.
 */

/** How long something may sit unattended before dispatch is told about it. */
export const REVIEW_SLA_MINUTES = 10;
export const ASSIGNMENT_SLA_MINUTES = 5;
/**
 * A rider out on a job whose position has not moved in this long has lost
 * tracking — screen asleep, permission revoked, phone off. The customer is
 * watching a frozen map, so dispatch should know before they call.
 */
export const TRACKING_STALE_MINUTES = 15;

/** Statuses where a rider is physically out with the goods. */
export const OUT_ON_THE_ROAD: OrderStatus[] = [
  "RIDER_GOING_TO_PICKUP",
  "RIDER_ARRIVED_AT_PICKUP",
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
];

/**
 * From the moment a shopping rider has the goods in hand. Past this point the
 * receipt should exist: until it does the payable is still the cap, so the
 * customer is about to be asked for the wrong amount and the rider's advance is
 * not on the books.
 */
export const GOODS_DUE_STATUSES: OrderStatus[] = [
  "ITEM_COLLECTED",
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
  "DELIVERED",
];

/**
 * Finished orders. A money problem on one of these has either been dealt with
 * or is no longer dispatch's to chase — closing an order is the dispatcher's
 * explicit "this is settled", and it is how a declined overspend stops shouting
 * once somebody has actually resolved it.
 */
export const CLOSED_OUT: OrderStatus[] = [
  "CLOSED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_UNL",
  "REJECTED",
  "REFUNDED",
];

const SHOPPING_SERVICE_TYPES: ServiceType[] = [...SHOPPING_SERVICES];

export type AttentionKind =
  | "SAFETY_FLAG"
  | "OVER_CAP_DECLINED"
  | "OVER_CAP_WAITING"
  | "RECEIPT_MISMATCH"
  | "GOODS_NOT_RECORDED"
  | "CUSTOMER_NOT_TOLD"
  | "PAYMENT_UNVERIFIED"
  | "RIDER_SILENT"
  | "NO_RIDER"
  | "QUOTE_UNANSWERED"
  | "TRACKING_LOST"
  | "UNREVIEWED";

/** The columns the classifier reads. Shared so a caller cannot under-select. */
export const ATTENTION_SELECT = {
  id: true,
  orderCode: true,
  createdAt: true,
  orderStatus: true,
  paymentStatus: true,
  quoteSentAt: true,
  quoteAcceptedAt: true,
  quoteDeclinedAt: true,
  customerNotifiedAt: true,
  assignedRiderId: true,
  assignedAt: true,
  riderAcceptedAt: true,
  riderLocationAt: true,
  serviceType: true,
  estimatedDeliveryFeeXaf: true,
  finalDeliveryFeeXaf: true,
  goodsCapXaf: true,
  goodsActualXaf: true,
  goodsRecordedAt: true,
  goodsReceiptReadXaf: true,
  overCapApprovedXaf: true,
  tipXaf: true,
  overCapApprovedAt: true,
  safetyFlag: true,
  safetyFlaggedAt: true,
  customer: { select: { fullName: true } },
  assignedRider: { select: { fullName: true } },
} satisfies Prisma.OrderSelect;

export type AttentionOrder = Prisma.OrderGetPayload<{ select: typeof ATTENTION_SELECT }>;

/**
 * Everything worth a dispatcher's attention, as a Prisma filter.
 *
 * Deliberately not limited to tonight: an order stuck since yesterday is
 * exactly the one you must not lose sight of.
 */
export function attentionWhere(visible: Prisma.OrderWhereInput, now: number): Prisma.OrderWhereInput {
  const reviewCutoff = new Date(now - REVIEW_SLA_MINUTES * 60_000);
  const assignmentCutoff = new Date(now - ASSIGNMENT_SLA_MINUTES * 60_000);
  const trackingCutoff = new Date(now - TRACKING_STALE_MINUTES * 60_000);

  return {
    ...visible,
    OR: [
      // Something in the free text was worth a person's eye before a rider is
      // sent to collect it. Never a refusal — the order is live and orderable;
      // this only asks somebody to read one sentence.
      { safetyFlaggedAt: { not: null } },
      // Waiting on a dispatcher to review and price it.
      { orderStatus: "AWAITING_DISPATCHER_REVIEW", createdAt: { lt: reviewCutoff } },
      // The customer says they paid and nobody has verified it.
      { paymentStatus: "SUBMITTED_UNVERIFIED" },
      // Priced, but the customer has not answered the quote.
      { quoteSentAt: { not: null }, quoteAcceptedAt: null, quoteDeclinedAt: null },
      // Priced and nobody has told them — the quote is waiting on us, not them.
      { quoteSentAt: { not: null }, customerNotifiedAt: null },
      // Paid and ready, with no rider on it.
      { orderStatus: "PAYMENT_VERIFIED", assignedRiderId: null },
      // Assigned, but the rider has not accepted.
      { assignedRiderId: { not: null }, riderAcceptedAt: null, assignedAt: { lt: assignmentCutoff } },
      // Out on the road with tracking that has gone quiet.
      {
        orderStatus: { in: OUT_ON_THE_ROAD },
        riderAcceptedAt: { not: null },
        OR: [{ riderLocationAt: null }, { riderLocationAt: { lt: trackingCutoff } }],
      },
      // The shop charged more than the customer agreed to and nobody has
      // answered. Until they do, the overage is not collectable.
      {
        goodsActualXaf: { gt: 0 },
        overCapApprovedAt: null,
        orderStatus: { notIn: CLOSED_OUT },
        OR: [{ goodsCapXaf: null }, { goodsActualXaf: { gt: prisma.order.fields.goodsCapXaf } }],
      },
      // They answered, and the answer was no. The goods are already bought, so
      // this is real money sitting on a decision only dispatch can make.
      {
        overCapApprovedAt: { not: null },
        overCapApprovedXaf: null,
        orderStatus: { notIn: CLOSED_OUT },
      },
      // Shopping done, no receipt recorded — the payable is still the cap.
      {
        serviceType: { in: SHOPPING_SERVICE_TYPES },
        orderStatus: { in: GOODS_DUE_STATUSES },
        goodsActualXaf: null,
      },
      // The receipt photo was read and does not agree with what the rider
      // typed. Pulled in broadly: whether the gap matters is decided by
      // `checkReceipt` in the classifier, so the tolerance lives in one place
      // rather than being restated as a Prisma filter.
      {
        goodsActualXaf: { not: null },
        goodsReceiptReadXaf: { not: null },
        orderStatus: { notIn: CLOSED_OUT },
      },
    ],
  };
}

export interface AttentionRow {
  id: string;
  orderCode: string;
  customerName: string;
  riderName: string | null;
  kind: AttentionKind;
  waitingMinutes: number;
}

/**
 * The single most urgent thing wrong with an order, in escalation order.
 *
 * The money figures come from `orderMoney`, never from arithmetic here, so this
 * can never tell dispatch one amount while the receipt and the payable say
 * another.
 */
export function classifyAttention(o: AttentionOrder, now: number): AttentionRow {
  const trackingCutoff = new Date(now - TRACKING_STALE_MINUTES * 60_000);

  const money = orderMoney({
    serviceType: o.serviceType,
    deliveryFeeXaf: o.finalDeliveryFeeXaf ?? o.estimatedDeliveryFeeXaf,
    goodsCapXaf: o.goodsCapXaf,
    goodsActualXaf: o.goodsActualXaf,
    overCapApprovedXaf: o.overCapApprovedXaf,
    tipXaf: o.tipXaf,
  });
  // A decline is stored as "answered, with nothing approved".
  const overCapDeclined =
    o.overCapApprovedAt != null && o.overCapApprovedXaf == null && money.needsCustomerApproval;
  const overCapWaiting = o.overCapApprovedAt == null && money.needsCustomerApproval;
  const goodsNotRecorded =
    money.shopping && o.goodsActualXaf == null && GOODS_DUE_STATUSES.includes(o.orderStatus);
  // Two readings of one receipt disagreeing. Not an accusation — far more often
  // a missing zero — but it is the only signal that the amount a customer is
  // about to be charged may be wrong.
  const receipt = checkReceipt(o.goodsActualXaf, o.goodsReceiptReadXaf);

  let kind: AttentionKind;
  /*
   * A safety concern outranks every money problem in this list, and that
   * ordering is deliberate. Everything else here is somebody's cash sitting in
   * the wrong place, which is recoverable at any hour. This one may be a rider
   * about to be sent to collect something they should not carry, or a person
   * who needs help faster than a delivery — and both stop being fixable the
   * moment the rider leaves.
   */
  if (o.safetyFlaggedAt) kind = "SAFETY_FLAG";
  // Money already spent and refused outranks the rest: nobody else can move it.
  else if (overCapDeclined) kind = "OVER_CAP_DECLINED";
  else if (overCapWaiting) kind = "OVER_CAP_WAITING";
  else if (receipt.needsLook) kind = "RECEIPT_MISMATCH";
  else if (goodsNotRecorded) kind = "GOODS_NOT_RECORDED";
  else if (o.quoteSentAt && !o.customerNotifiedAt) kind = "CUSTOMER_NOT_TOLD";
  else if (o.paymentStatus === "SUBMITTED_UNVERIFIED") kind = "PAYMENT_UNVERIFIED";
  else if (o.assignedRiderId && !o.riderAcceptedAt) kind = "RIDER_SILENT";
  else if (o.orderStatus === "PAYMENT_VERIFIED" && !o.assignedRiderId) kind = "NO_RIDER";
  else if (o.quoteSentAt && !o.quoteAcceptedAt && !o.quoteDeclinedAt) kind = "QUOTE_UNANSWERED";
  else if (
    OUT_ON_THE_ROAD.includes(o.orderStatus) &&
    o.riderAcceptedAt &&
    (!o.riderLocationAt || o.riderLocationAt < trackingCutoff)
  )
    kind = "TRACKING_LOST";
  else kind = "UNREVIEWED";

  // Time the clock from the moment the problem started, not from the order. An
  // overspend has been outstanding since the money left the rider's hand.
  const since =
    kind === "RIDER_SILENT" && o.assignedAt
      ? o.assignedAt
      : (kind === "OVER_CAP_DECLINED" || kind === "OVER_CAP_WAITING") && o.goodsRecordedAt
        ? o.goodsRecordedAt
        : o.createdAt;

  return {
    id: o.id,
    orderCode: o.orderCode,
    customerName: o.customer.fullName,
    riderName: o.assignedRider?.fullName ?? null,
    kind,
    waitingMinutes: Math.max(0, Math.round((now - since.getTime()) / 60_000)),
  };
}

/** What each kind means, in one sentence, for somebody who has to act on it. */
export const ATTENTION_MEANING: Record<AttentionKind, string> = {
  SAFETY_FLAG:
    "something in what the customer wrote is worth reading before a rider is sent — it is a flag for a person to judge, never a refusal",
  OVER_CAP_DECLINED:
    "the shop charged more than the customer agreed to, the customer refused, and the goods are already bought — only dispatch can settle this",
  OVER_CAP_WAITING: "the shop charged over the cap and the customer has not answered yet, so the overage is not collectable",
  RECEIPT_MISMATCH: "the receipt photo and the amount the rider typed do not agree",
  GOODS_NOT_RECORDED: "the rider has the goods but recorded no receipt, so the payable is still the cap",
  CUSTOMER_NOT_TOLD: "it has been priced and nobody has told the customer",
  PAYMENT_UNVERIFIED: "the customer says they paid and nobody has verified it",
  RIDER_SILENT: "a rider was assigned and has not accepted",
  NO_RIDER: "it is paid and ready with no rider on it",
  QUOTE_UNANSWERED: "the customer was quoted and has not answered",
  TRACKING_LOST: "the rider is out and their position has gone quiet — the customer is watching a frozen map",
  UNREVIEWED: "it is waiting on a dispatcher to review and price it",
};
