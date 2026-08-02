import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { mailConfig, operationsInbox } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/**
 * Every message this business tried to send, and what the provider said back.
 *
 * `NotificationLog` has recorded the recipient, the status and the provider's
 * exact error on every send since operational email shipped — and **read by
 * nothing**. So when signup notifications stopped arriving in the business
 * inbox there was no way to tell whether they were never attempted, refused by
 * Resend, or delivered and filed as spam. Three causes, three completely
 * different fixes, one identical silence.
 *
 * That is the same failure the address log and the maps panel both had. The
 * answer each time is the same: the diagnosis already exists, it just needs a
 * screen.
 *
 * Staff-only. The rows carry customer names in subject lines and the error text
 * can quote configuration back, neither of which belongs anywhere public.
 */

/** Enough to see a pattern, few enough to read at a glance. */
const RECENT = 25;

export async function GET() {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [recent, failedLately, inbox] = await Promise.all([
    prisma.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: {
        id: true,
        channel: true,
        event: true,
        recipient: true,
        subject: true,
        status: true,
        error: true,
        createdAt: true,
      },
    }),
    // The headline number. One failure is a blip; every send failing is a
    // configuration problem, and that difference should not need counting by eye.
    prisma.notificationLog.count({
      where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    operationsInbox(),
  ]);

  const config = mailConfig();

  return NextResponse.json({
    inbox,
    from: config.from,
    hasApiKey: config.hasApiKey,
    failedLastWeek: failedLately,
    // Sending a real message is the one action here that leaves the building,
    // so it is held to the same bar as every other privileged mutation.
    canTest: user.role === "OWNER",
    recent: recent.map((r) => ({
      id: r.id,
      channel: r.channel,
      event: r.event,
      recipient: r.recipient,
      subject: r.subject,
      status: r.status,
      error: r.error,
      at: r.createdAt.toISOString(),
    })),
  });
}
