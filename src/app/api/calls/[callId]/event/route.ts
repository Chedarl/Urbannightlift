import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authoriseCall } from "@/lib/calls/authorise";
import { callEventDetail } from "@/lib/calls/redact";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/[callId]/event — what the connection is doing.
 *
 * ## Why the browser reports and the server decides what to keep
 *
 * The only place that knows whether a call connected directly or had to relay
 * is the browser holding the peer connection. It is also the place holding
 * both parties' IP addresses, in the candidate strings, the SDP and half the
 * stats object.
 *
 * So the browser sends what it has and `callEventDetail` — an **allowlist** —
 * decides what survives. That inversion is the whole design: a route that
 * trusted the client's idea of "safe to log" would accumulate the home IP
 * address of every customer who ever rang a rider, indexed by order, in a
 * table nobody thinks of as sensitive.
 *
 * A body that survives to nothing is stored as nothing, and that is a success
 * rather than an error — the alternative teaches clients to send more.
 *
 * ## What this is for
 *
 * One question a dispatcher will actually be asked: *why could they not hear
 * each other?* The answer is nearly always the ICE state and whether it had to
 * relay. Neither identifies a person or a place.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  let body: { orderCode?: string; kind?: string; detail?: unknown; connected?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderCode = (body.orderCode ?? "").trim().toUpperCase();
  if (!orderCode) return NextResponse.json({ error: "Missing orderCode" }, { status: 400 });

  const auth = await authoriseCall(orderCode);
  // Identity only, like `end`: a call that is already up keeps reporting even
  // after the order has moved past the window that allowed it to start, and
  // losing the diagnostics for exactly those calls would be perverse.
  if (!auth.order || !auth.party) {
    return NextResponse.json({ error: "NOT_YOUR_ORDER" }, { status: 403 });
  }

  const session = await prisma.callSession.findUnique({
    where: { id: callId },
    select: { id: true, orderId: true, connectedAt: true, endedAt: true },
  });
  if (!session || session.orderId !== auth.order.id) {
    return NextResponse.json({ error: "NOT_YOUR_ORDER" }, { status: 403 });
  }
  if (session.endedAt) return NextResponse.json({ ok: true, ignored: "ENDED" });

  // A closed vocabulary, for the same reason `endReason` has one.
  const KINDS = ["connected", "ice", "stats"] as const;
  const kind = (KINDS as readonly string[]).includes(body.kind ?? "") ? body.kind! : "ice";

  await prisma.$transaction([
    prisma.callEvent.create({
      data: { callId: session.id, kind, detail: callEventDetail(body.detail) ?? undefined },
    }),
    ...(body.connected === true && session.connectedAt == null
      ? [
          prisma.callSession.update({
            where: { id: session.id },
            data: { connectedAt: new Date() },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
