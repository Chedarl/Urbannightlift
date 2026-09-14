import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET — when the watchman last looked at the night.
 *
 * The fifth readout on the settings screen, and it exists for the reason all
 * four before it do: this product keeps being bitten by a thing that fails
 * invisibly, and the fix each time is to put it on a screen.
 *
 * This one's failure was the loudest and the least visible at once. The
 * workflow that calls the watchman needs `CRON_SECRET` in the **GitHub** secret
 * store, which is separate from Vercel's. It was never added, so the job failed
 * 374 times across a month — every failure going to an inbox, none of them to
 * any screen in the product. The owner's report was that the system was
 * "failing with bugs all over", which was a fair reading of 374 red crosses.
 *
 * So: a timestamp, and a plain sentence about what it means.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.operatingSettings.findUnique({
    where: { id: 1 },
    select: { watchmanRanAt: true },
  });

  const ranAt = settings?.watchmanRanAt ?? null;
  const minutesAgo = ranAt ? Math.floor((Date.now() - ranAt.getTime()) / 60_000) : null;

  return NextResponse.json({
    ranAt: ranAt?.toISOString() ?? null,
    minutesAgo,
    // Scheduled every 30 minutes, and GitHub's scheduler is best-effort, so two
    // hours of silence is the first point at which something is actually wrong
    // rather than merely late.
    stale: minutesAgo == null || minutesAgo > 120,
  });
}
