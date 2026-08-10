import { NextRequest, NextResponse } from "next/server";
import { runWatchman } from "@/lib/orders/watchman";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The watchman round, fired every ten minutes through the night.
 *
 * Separate from the nightly summary because the timing requirement is the
 * opposite: a summary at 04:30 is exactly right for a finished night, and
 * exactly useless for an order stuck at 11 PM. This is the one thing in the
 * product that has to run *while* the night is happening.
 *
 * **Scheduled from `.github/workflows/watchman.yml`, not `vercel.json`.** The
 * Vercel Hobby plan permits only daily crons and refused the deployment
 * outright — and a daily round cannot watch a night in progress. GitHub Actions
 * costs nothing, this repository already uses it, and the endpoint is identical
 * either way: if the project ever moves to Vercel Pro, the schedule moves back
 * and nothing here changes.
 *
 * Guarded by CRON_SECRET like the summary — it reads every live order and can
 * push to every dispatcher's phone, so it is not left open.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const result = await runWatchman();
  return NextResponse.json(result);
}
