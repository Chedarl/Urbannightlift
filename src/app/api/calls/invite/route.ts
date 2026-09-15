import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authoriseCall, denyStatus } from "@/lib/calls/authorise";
import { callChannelName, mintCallSecret, secretHash } from "@/lib/calls/channel";
import { mintIceServers } from "@/lib/calls/ice";
import { ringMode } from "@/lib/calls/policy";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/invite — open a call on an order.
 *
 * ## What comes back, and what deliberately does not
 *
 * Back: a call id, the channel name the two browsers meet on, the per-call
 * secret every message must carry, ICE servers, and whether the connection can
 * relay if it cannot go direct.
 *
 * Not back, in any field, ever: a phone number, an email, a user id, a customer
 * id, or a name. The whole point of this feature is that the customer and the
 * rider speak without either learning how to reach the other again tomorrow,
 * and a response shape is the easiest place for that to leak by accident.
 * `verify-calls` asserts the shape rather than trusting this paragraph.
 *
 * ## Why the ring mode is decided here
 *
 * **The rider is on a motorbike.** Ringing somebody mid-ride is a safety event:
 * they either ignore it, or they answer it, and the second is worse. So while
 * the rider is in motion a customer's tap becomes a notification — *your
 * customer would like a word* — and the rider calls back when they are stopped.
 * That decision belongs on the server, because a client that decided it could
 * be told to ring anyway.
 */
export async function POST(req: NextRequest) {
  let body: { orderCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderCode = (body.orderCode ?? "").trim().toUpperCase();
  if (!orderCode) return NextResponse.json({ error: "Missing orderCode" }, { status: 400 });

  const auth = await authoriseCall(orderCode);
  if (!auth.ok || !auth.order || !auth.party) {
    return NextResponse.json({ error: auth.reason }, { status: denyStatus(auth.reason) });
  }

  /*
    Counted per caller rather than per address.

    A call rings a person. Somebody tapping it a dozen times in an hour is not
    a load problem, and counting them by IP would put a whole Yaoundé household
    behind one budget while letting a determined caller move networks.
  */
  const limit = await checkRateLimit(req, "call", undefined, `${auth.party}:${auth.order.id}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "TOO_MANY", retryInMinutes: limit.retryInMinutes },
      { status: 429 }
    );
  }

  const channelSecret = process.env.CALL_CHANNEL_SECRET;
  if (!channelSecret) {
    /*
      Refused rather than fudged. A default secret would make every deployment
      share a channel namespace, and the channel name is the first of the two
      locks on this line. Saying so plainly is what gets it set.
    */
    return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  }

  const secret = mintCallSecret();
  const mode = ringMode(auth.order.orderStatus);

  const [session, ice] = await Promise.all([
    prisma.callSession.create({
      data: {
        orderId: auth.order.id,
        initiatedBy: auth.party,
        riderUserId: auth.order.assignedRiderId,
        customerId: auth.order.customerId,
        secretHash: secretHash(secret),
        ringMode: mode,
        events: { create: { kind: "ring", detail: { ringMode: mode } } },
      },
      select: { id: true },
    }),
    mintIceServers(),
  ]);

  return NextResponse.json({
    callId: session.id,
    channel: callChannelName(auth.order.id, channelSecret),
    secret,
    /** Which side this caller is, so their browser can drop its own echoes. */
    party: auth.party,
    ringMode: mode,
    iceServers: ice.iceServers,
    /*
      Whether a relay is available, told to the browser rather than discovered
      by it. Roughly one mobile connection in five cannot go peer-to-peer at
      all behind carrier-grade NAT, and without TURN those calls simply fail
      after twenty seconds of silence. A screen that knows can say "calls may
      not connect on this network" instead of pretending and timing out.
    */
    relayCapable: ice.relayCapable,
  });
}
