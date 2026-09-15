import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authoriseCall } from "@/lib/calls/authorise";
import { END_REASONS, safeReason } from "@/lib/calls/redact";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/[callId]/end — the call is over.
 *
 * ## Why this does not refuse a closed order
 *
 * Every other call route runs the full policy and declines when the order has
 * moved on. This one deliberately does not: `authoriseCall` decides *who* is
 * asking, and its verdict on *when* is ignored.
 *
 * A call that is already connected outlives the state that let it start — an
 * order can be delivered, cancelled or put on a safety hold mid-conversation,
 * and in every one of those cases the right answer to "hang up" is to hang up.
 * Refusing would leave a row marked open forever and, worse, teach the client
 * that ending a call can fail, which is the one thing it must never do.
 *
 * Identity is still required. Anybody who can prove neither side of the order
 * cannot end somebody else's call.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  let body: { orderCode?: string; reason?: string; connected?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderCode = (body.orderCode ?? "").trim().toUpperCase();
  if (!orderCode) return NextResponse.json({ error: "Missing orderCode" }, { status: 400 });

  const auth = await authoriseCall(orderCode);
  // Note the deliberate difference from every other route in this folder: only
  // `party` and `order` are consulted, never `auth.ok`. See the note above.
  if (!auth.order || !auth.party) {
    return NextResponse.json({ error: "NOT_YOUR_ORDER" }, { status: 403 });
  }

  const session = await prisma.callSession.findUnique({
    where: { id: callId },
    select: { id: true, orderId: true, endedAt: true, connectedAt: true },
  });
  if (!session || session.orderId !== auth.order.id) {
    return NextResponse.json({ error: "NOT_YOUR_ORDER" }, { status: 403 });
  }

  // Idempotent. A hang-up that races the peer's hang-up must not be an error,
  // and a client retrying on a flaky connection must not double-write.
  if (session.endedAt) return NextResponse.json({ ok: true, alreadyEnded: true });

  await prisma.$transaction([
    prisma.callSession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(),
        // An allowlist, not free text. A reason field is exactly where an IP
        // address or an error string containing one ends up.
        endReason: safeReason(body.reason, END_REASONS),
        // Only set if it was not already: the moment media first flowed is a
        // fact about the past and a late client must not move it.
        connectedAt:
          session.connectedAt ?? (body.connected === true ? new Date() : null),
      },
    }),
    prisma.callEvent.create({
      data: { callId: session.id, kind: "end", detail: { reason: safeReason(body.reason, END_REASONS) } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
