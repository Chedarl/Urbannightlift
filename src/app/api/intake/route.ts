import { NextRequest, NextResponse } from "next/server";

import { getOperatingSettings } from "@/lib/settings";
import { readIntake } from "@/lib/ai/intake";
import { checkRateLimit, limitMessage } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST — one sentence, read into the fields of an order form.
 *
 * **This creates nothing.** It returns a draft the browser puts into the form
 * the customer would have filled anyway, and they press the buttons from there.
 * So every guard in `POST /api/orders` — pricing, zones, operating hours, the
 * enabled-services check, payment — still runs on exactly the input it always
 * did, and a bad reading can only ever put wrong text in a box somebody is
 * looking at.
 *
 * Public, because it sits at the very front of the order flow, before anybody
 * has signed in. Rate-limited for the same reason.
 */
export async function POST(req: NextRequest) {
  const limit = await checkRateLimit(req, "intake");
  if (!limit.ok) {
    return NextResponse.json(
      { error: limitMessage(limit, false) },
      { status: 429, headers: { "Retry-After": String(limit.retryInMinutes * 60) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sentence = typeof body.text === "string" ? body.text : "";

  // The enabled list comes from settings here rather than from the caller, so a
  // hand-crafted request cannot talk itself into a service the owner paused.
  const settings = await getOperatingSettings();
  const read = await readIntake(sentence, settings.enabledServices);

  if (!read.data) return NextResponse.json({ error: read.error }, { status: 400 });
  return NextResponse.json({ draft: read.data });
}
