import "server-only";

import { sendPush } from "@/lib/notify/push";
import { groupXaf } from "@/lib/utils";
import {
  emailNewOrder,
  emailRiderApplication,
  emailAmbassadorSignup,
  emailMerchantSignup,
  emailPaymentSubmitted,
} from "@/lib/email/operations";

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
export async function notifyMerchantSignup(merchantName: string, categoryLabel: string, merchantId?: string) {
  if (merchantId) await emailMerchantSignup(merchantId);
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

/** Riders are the constraint on how many orders a night can take. */
export async function notifyRiderApplication(applicationId: string, fullName: string) {
  // Push reaches whoever has the console open; email reaches the owner
  // wherever they are, and leaves a record that we were told.
  await emailRiderApplication(applicationId);

  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: "Someone wants to ride for us",
      body: `${fullName} — waiting for their ID to be checked.`,
      url: "/admin/riders/applications",
      tag: `rider-application-${applicationId}`,
    }
  ).catch(() => 0);
}

/** An ambassador is a standing commitment to pay somebody — approve deliberately. */
export async function notifyAmbassadorSignup(code: string, fullName: string, ambassadorId?: string) {
  if (ambassadorId) await emailAmbassadorSignup(ambassadorId);
  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: "A new ambassador applied",
      body: `${fullName} wants the code ${code}.`,
      url: "/admin/ambassadors",
      tag: `ambassador-signup-${code}`,
    }
  ).catch(() => 0);
}

export async function notifyNewOrder(orderCode: string, orderId: string, serviceLabel: string) {
  await emailNewOrder(orderId);

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
  await emailPaymentSubmitted(orderId);
  await sendPush(
    { roles: DISPATCH_ROLES },
    {
      title: `Payment sent for ${orderCode}`,
      body: amountXaf
        ? `The customer says they paid ${groupXaf(amountXaf)} XAF. Verify it to release the order.`
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

/**
 * A customer wants a word, and the rider is mid-ride.
 *
 * ## Why this returns a number
 *
 * Every other trigger in this file swallows its result — a notification is
 * never allowed to fail the thing it is announcing, and nobody is told whether
 * the dispatcher's phone actually buzzed.
 *
 * This one is different, because the customer is about to be told what
 * happened. v50 shipped a call sheet that said *"they have been told, and will
 * call you back as soon as they stop"* while `/api/calls/invite` sent nothing
 * at all — a sentence that was simply untrue. Returning the device count lets
 * the screen say the true thing either way, which matters most right now:
 * `sendPush` returns 0 whenever VAPID keys are unset, and they are.
 *
 * Still never throws. A failed notification must not fail the call.
 */
export async function notifyCallbackRequest(
  riderId: string,
  orderCode: string,
  orderId: string
): Promise<number> {
  return sendPush(
    { userIds: [riderId] },
    {
      title: `Your customer would like a word — ${orderCode}`,
      body: "They tried to call. Give them a ring when you have stopped.",
      url: `/rider/orders/${orderId}`,
      // One per order: a customer tapping call three times should replace the
      // notification, not stack three of them on a rider's lock screen.
      tag: `callback-${orderId}`,
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
/**
 * The rider is on the way, and here is the code to let them hand over.
 *
 * Sent at dispatch rather than at ordering because that is when the code comes
 * into existence and when it starts to matter — a code delivered hours early is
 * a code the customer has to go and find again.
 */
export async function notifyCustomerDispatched(
  customerId: string,
  orderCode: string,
  riderName: string,
  otpCode: string | null
) {
  await sendPush(
    { customerIds: [customerId] },
    {
      title: `Your rider is on the way — ${orderCode}`,
      body: otpCode
        ? `${riderName} is coming. Give them the code ${otpCode} when they arrive.`
        : `${riderName} is on the way with your order.`,
      url: `/order/confirmation/${orderCode}`,
      tag: `order-dispatched-${orderCode}`,
    }
  ).catch(() => 0);
}

export async function notifyQuoteSent(customerId: string, orderCode: string, feeXaf: number) {
  await sendPush(
    { customerIds: [customerId] },
    {
      title: `Order ${orderCode} accepted`,
      body: `Delivery is ${groupXaf(feeXaf)} XAF. Tap to confirm and we'll assign a rider.`,
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
