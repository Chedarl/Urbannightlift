import "server-only";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { getCustomerId } from "@/lib/auth/customer";
import { hasOrderAccess } from "@/lib/orders/orderAccess";
import { getOperatingSettings } from "@/lib/settings";
import { canCall, type CallDenyReason, type CallParty } from "@/lib/calls/policy";

/**
 * The one place a call route decides whether somebody may be on this line.
 *
 * ## Why it is shared rather than repeated
 *
 * Four routes need the same answer — invite, answer, end, and the channel
 * handshake — and the previous generation of this codebase learned what happens
 * when a money rule is written out twice. An authorisation rule is worse: the
 * copies do not disagree loudly, they disagree in the one route somebody
 * forgot, and the failure is a stranger on a call.
 *
 * ## How each party proves who they are
 *
 * **The rider** is a staff `User` with a session, and must be the order's
 * `assignedRiderId`. Being a rider is not enough; being *this* order's rider is.
 *
 * **The customer** is either a signed-in `Customer`, or a guest holding the
 * `hasOrderAccess` HMAC cookie for this order code — the same proof the
 * tracking page already requires before showing a delivery OTP. A guest who has
 * proved an order is the person who placed it, and refusing them a call while
 * showing them the rider's name and position would be a strange place to draw
 * the line.
 *
 * ## What it returns, and why not a boolean
 *
 * A reason. "He hasn't accepted the job yet" and "this order is finished" are
 * different sentences and both are better than a greyed-out button with no
 * explanation — which is what the customer would otherwise stare at while
 * standing outside a gate at one in the morning.
 */

export interface CallAuth {
  ok: boolean;
  reason: CallDenyReason;
  party?: CallParty;
  order?: {
    id: string;
    orderCode: string;
    customerId: string;
    assignedRiderId: string | null;
    orderStatus: import("@prisma/client").OrderStatus;
  };
}

/**
 * Who is asking, and may they.
 *
 * `orderCode` rather than `orderId` on the way in, because that is what a
 * customer's browser has and what the access cookie is keyed by. The id never
 * leaves the server.
 */
export async function authoriseCall(orderCode: string): Promise<CallAuth> {
  const order = await prisma.order.findUnique({
    where: { orderCode },
    select: {
      id: true,
      orderCode: true,
      customerId: true,
      assignedRiderId: true,
      riderAcceptedAt: true,
      orderStatus: true,
      // The column is `completedAt`, set the moment a status change lands on
      // DELIVERED. The policy calls it `deliveredAt` because that is what it
      // means to the fifteen-minute grace window.
      completedAt: true,
      customerConfirmedAt: true,
    },
  });
  // A missing order and an order somebody has no business with give the same
  // answer, on purpose: a different one would turn this into an oracle for
  // whether an order code is real.
  if (!order) return { ok: false, reason: "NOT_YOUR_ORDER" };

  const settings = await getOperatingSettings();
  const enabled = settings.callingEnabled === true;

  /*
    Staff identity is asked for, not depended on.

    `getSessionUser` reaches Supabase, and it **throws** when Supabase is
    unconfigured or unreachable rather than returning null. Unwrapped, that
    makes an outage in the staff auth provider a 500 on this route — so a
    customer standing at a gate, who is not a staff user and never needed
    Supabase at all, gets "something went wrong" instead of a call.

    Failing to identify a rider is a perfectly good answer: it means this caller
    is not the rider, and the customer branch below still works on its own
    cookie. The rider's own side genuinely needs Supabase and will fail there,
    which is the right place for it to fail.
  */
  const [user, customerId] = await Promise.all([
    getSessionUser().catch(() => null),
    getCustomerId(),
  ]);

  /*
    The rider is checked first and only counts if they are *this* order's rider.

    A staff session on an order somebody else is delivering falls through to the
    customer branch and fails there too, rather than being quietly treated as a
    customer — a dispatcher is neither party on this call.
  */
  let party: CallParty | null = null;
  let actorId = "";
  if (user && order.assignedRiderId && user.id === order.assignedRiderId) {
    party = "RIDER";
    actorId = user.id;
  } else if (customerId && customerId === order.customerId) {
    party = "CUSTOMER";
    actorId = customerId;
  } else if (!user && (await hasOrderAccess(order.orderCode))) {
    // A guest who proved this order with their code and number. The same proof
    // the tracking page takes before showing a delivery OTP.
    party = "CUSTOMER";
    actorId = order.customerId;
  }

  if (!party) return { ok: false, reason: "NOT_YOUR_ORDER" };

  const verdict = canCall({
    orderStatus: order.orderStatus,
    assignedRiderId: order.assignedRiderId,
    riderAcceptedAt: order.riderAcceptedAt,
    deliveredAt: order.completedAt,
    customerConfirmedAt: order.customerConfirmedAt,
    party,
    actorId,
    orderCustomerId: order.customerId,
    enabled,
    now: new Date(),
  });

  return {
    ok: verdict.ok,
    reason: verdict.reason,
    party,
    order: {
      id: order.id,
      orderCode: order.orderCode,
      customerId: order.customerId,
      assignedRiderId: order.assignedRiderId,
      orderStatus: order.orderStatus,
    },
  };
}

/** HTTP status for a refusal, so every route answers the same way. */
export function denyStatus(reason: CallDenyReason): number {
  switch (reason) {
    case "NOT_YOUR_ORDER":
      return 403;
    case "DISABLED":
      return 503;
    default:
      // Everything else is "not right now", which is a conflict with the state
      // of the order rather than a failure of authorisation.
      return 409;
  }
}
