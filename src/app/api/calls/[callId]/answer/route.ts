import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authoriseCall, denyStatus } from "@/lib/calls/authorise";
import { callChannelName, callSecret } from "@/lib/calls/channel";
import { mintIceServers } from "@/lib/calls/ice";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/[callId]/answer — join a call somebody else opened.
 *
 * ## Why the answering side is re-authorised from scratch
 *
 * It would be tempting to treat "you were sent a call id" as proof: the id came
 * from the server, the channel name is a secret, nobody else should have it.
 * That is capability thinking, and capabilities leak — a call id travels
 * through a push notification, which lands on a lock screen.
 *
 * So the answerer proves the order the same way the caller did, and
 * `authoriseCall` runs the full policy again. An order that moved to
 * `SAFETY_HOLD` between the ring and the answer is not answerable, which is
 * exactly the case where somebody would most want to route around the
 * dispatcher who put it there.
 *
 * ## The secret *is* returned here, and the first version was wrong to refuse
 *
 * v50 deliberately withheld it, reasoning that "two ways to obtain the thing
 * that authenticates every message is one too many". That made a two-party call
 * impossible: the secret was minted at `invite`, only the **caller** calls
 * invite, so the answerer could never obtain the value every message must
 * carry. A `verify-calls` assertion was enforcing the mistake.
 *
 * Both endpoints sit behind the same `authoriseCall` and the same
 * "does this call belong to your order" check, so this is not a second, weaker
 * door — it is the same door, for the other person. The secret is derived from
 * the call id (`callSecret`), so it is not stored anywhere to be stolen from.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

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

  const session = await prisma.callSession.findUnique({
    where: { id: callId },
    select: { id: true, orderId: true, endedAt: true },
  });
  // The call must belong to the order this person just proved. Without this
  // check a valid call id from any order would be answerable by anyone holding
  // any order — which is every guest with a tracking cookie.
  if (!session || session.orderId !== auth.order.id) {
    return NextResponse.json({ error: "NOT_YOUR_ORDER" }, { status: 403 });
  }
  if (session.endedAt) return NextResponse.json({ error: "ENDED" }, { status: 409 });

  const channelSecret = process.env.CALL_CHANNEL_SECRET;
  if (!channelSecret) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const ice = await mintIceServers();

  await prisma.callEvent.create({ data: { callId: session.id, kind: "answer" } });

  return NextResponse.json({
    callId: session.id,
    channel: callChannelName(auth.order.id, channelSecret),
    /*
      The same value the caller derived. Without it the answerer can neither
      authenticate what it receives nor sign what it sends, which is to say it
      cannot take the call at all.
    */
    secret: callSecret(session.id, channelSecret),
    party: auth.party,
    iceServers: ice.iceServers,
    relayCapable: ice.relayCapable,
  });
}
