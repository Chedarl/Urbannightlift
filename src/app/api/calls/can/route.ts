import { NextRequest, NextResponse } from "next/server";

import { authoriseCall } from "@/lib/calls/authorise";

export const dynamic = "force-dynamic";

/**
 * GET /api/calls/can?orderCode=… — may this viewer call, right now.
 *
 * ## Why this is not a field on the tracking payload
 *
 * `GET /api/track/[orderCode]` is deliberately **public**: any order code
 * returns a snapshot, because the code is unguessable and nothing in that
 * response is a credential. Whether *you* may open a voice line is the
 * opposite kind of question — it depends entirely on who is asking — and
 * answering it from a route that never asks would mean the page rendering a
 * call button for anybody holding a screenshot.
 *
 * So it lives here, behind the same `authoriseCall` every other call route
 * uses, and the screen asks separately.
 *
 * ## It returns the reason, not just a boolean
 *
 * The button renders nothing when it cannot be used — a greyed-out phone icon
 * advertises a feature, invites a tap and answers with nothing, which is what
 * the Orange Money button did for months. But the reason is still returned,
 * because a screen that wants to say "he hasn't accepted the job yet" should be
 * able to, and because a client that only ever sees `false` cannot be debugged.
 */
export async function GET(req: NextRequest) {
  const orderCode = (req.nextUrl.searchParams.get("orderCode") ?? "").trim().toUpperCase();
  if (!orderCode) return NextResponse.json({ callable: false, reason: "NOT_YOUR_ORDER" });

  const auth = await authoriseCall(orderCode);

  // Always 200. A refusal is an answer, not an error, and a 403 here would make
  // the tracking screen log a failure every seven seconds on every order that
  // simply has no rider yet.
  return NextResponse.json({ callable: auth.ok, reason: auth.reason });
}
