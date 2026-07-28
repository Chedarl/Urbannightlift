import "server-only";

import { sendPush } from "@/lib/notify/push";

/**
 * The moments worth interrupting someone for.
 *
 * Each of these corresponds to a place where the operation used to stall in
 * silence: a new order nobody saw, a payment nobody knew had arrived, an
 * assignment the rider never opened, a quote the customer was never told
 * about. Every function swallows its own failures — a notification is never
 * allowed to fail the thing it is announcing.
 */

const DISPATCH_ROLES = ["OWNER", "DISPATCHER", "SUPPORT"];

/** A merchant signing up at 11 PM is worth calling back at 11 PM. */
export async function notifyMerchantSignup(merchantName: string, categoryLabel: string) {
  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: "A business wants to join",
      body: `${merchantName} — ${categoryLabel}`,
      url: "/admin/merchants?tab=queue",
      tag: "merchant-signup",
    }
  ).catch(() => 0);
}

export async function notifyNewOrder(orderCode: string, orderId: string, serviceLabel: string) {
  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: `New order ${orderCode}`,
      body: `${serviceLabel} — waiting for review and a price.`,
      url: `/admin/orders/${orderId}`,
      tag: `order-new-${orderId}`,
    }
  ).catch(() => 0);
}

export async function notifyPaymentSubmitted(orderCode: string, orderId: string, amountXaf: number | null) {
  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: `Payment sent for ${orderCode}`,
      body: amountXaf
        ? `The customer says they paid ${amountXaf.toLocaleString("fr-FR")} XAF. Verify it to release the order.`
        : "The customer submitted proof of payment. Verify it to release the order.",
      url: `/admin/orders/${orderId}`,
      tag: `payment-${orderId}`,
    }
  ).catch(() => 0);
}

export async function notifyRiderAssigned(riderId: string, orderCode: string, orderId: string) {
  await sendPush(
    { userIds: [riderId] },
    {
      title: `New delivery offered — ${orderCode}`,
      body: "Open the order and accept it so dispatch knows you're on it.",
      url: `/rider/orders/${orderId}`,
      tag: `assign-${orderId}`,
    }
  ).catch(() => 0);
}

export async function notifyRiderAnswered(
  orderCode: string,
  orderId: string,
  riderName: string,
  accepted: boolean,
  reason?: string | null
) {
  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: accepted ? `${riderName} accepted ${orderCode}` : `${riderName} declined ${orderCode}`,
      body: accepted
        ? "The rider is on it."
        : `Reassign this order.${reason ? ` Reason: ${reason}` : ""}`,
      url: `/admin/orders/${orderId}`,
      tag: `assign-answer-${orderId}`,
    }
  ).catch(() => 0);
}

/** The customer's order was priced and is waiting on them to agree. */
export async function notifyQuoteSent(customerId: string, orderCode: string, feeXaf: number) {
  await sendPush(
    { customerIds: [customerId] },
    {
      title: `Order ${orderCode} accepted`,
      body: `Delivery is ${feeXaf.toLocaleString("fr-FR")} XAF. Tap to confirm and we'll assign a rider.`,
      url: `/order/confirmation/${orderCode}`,
      tag: `quote-${orderCode}`,
    }
  ).catch(() => 0);
}

export async function notifyCustomerStatus(customerId: string, orderCode: string, headline: string) {
  await sendPush(
    { customerIds: [customerId] },
    {
      title: `Order ${orderCode}`,
      body: headline,
      url: `/order/confirmation/${orderCode}`,
      tag: `status-${orderCode}`,
    }
  ).catch(() => 0);
}
