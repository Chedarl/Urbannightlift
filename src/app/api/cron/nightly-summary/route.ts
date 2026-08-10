import { NextRequest, NextResponse } from "next/server";
import { sendNightlySummary } from "@/lib/email/nightlySummary";
import { runHousekeeping } from "@/lib/maintenance/housekeeping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fired by Vercel Cron at 04:30 Yaoundé time, half an hour after the night
 * closes, so the summary covers a finished night rather than one in progress.
 *
 * Guarded by CRON_SECRET rather than left open: this reads the whole night's
 * takings and sends them somewhere. Vercel signs its own cron requests with
 * that header, and anyone else gets a 401.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Refuse to run wide open in production rather than quietly exposing takings.
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const result = await sendNightlySummary();

  /*
   * The tidy-up, on the one schedule that already exists.
   *
   * Deliberately after the summary and never able to affect it: housekeeping
   * swallows its own failures and returns what it managed, so a sweep that
   * cannot reach a table does not stop the owner getting the night's takings.
   *
   * It rides this cron rather than getting its own because a second schedule is
   * a second thing that can be silently not running — which is the exact defect
   * this is fixing.
   */
  const swept = await runHousekeeping();

  return NextResponse.json({ ...result, swept });
}
