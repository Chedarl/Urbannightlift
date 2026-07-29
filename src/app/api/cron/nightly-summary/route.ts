import { NextRequest, NextResponse } from "next/server";
import { sendNightlySummary } from "@/lib/email/nightlySummary";

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
  return NextResponse.json(result);
}
