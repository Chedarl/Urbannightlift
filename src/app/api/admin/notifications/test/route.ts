import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendEmail, operationsInbox } from "@/lib/email/send";
import { ADMIN, plain, shell } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/notifications/test — send one real message, right now.
 *
 * The point is to collapse a diagnosis into five seconds. Working out why mail
 * is not arriving otherwise means placing a real order, waiting, checking an
 * inbox, and still not knowing which of three causes you are looking at. This
 * sends the same way every operational message is sent, through the same
 * `sendEmail`, and hands back the provider's verdict verbatim.
 *
 * **OWNER only.** It causes an outbound message on demand, which is exactly the
 * bar every other privileged mutation in this app is held to — and an endpoint
 * any dispatcher could hammer is an endpoint that can burn a monthly send quota.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = await operationsInbox();
  const sentAt = new Date();

  const content = {
    heading: "Your email is working",
    subheading:
      "Somebody pressed the test button in Settings. Nothing has gone wrong — this is the proof that operational mail reaches this inbox.",
    fields: [
      { label: "Sent to", value: to },
      { label: "Sent by", value: `${user.fullName} (${user.role})` },
      { label: "Sent at", value: sentAt.toISOString() },
    ],
    actionLabel: "Back to settings",
    actionUrl: `${ADMIN.dashboard().replace("/dashboard", "/settings")}`,
    footnote:
      "If this arrived, new orders, signups, rider applications and payment alerts will arrive the same way.",
  };

  const result = await sendEmail({
    to,
    subject: "Urban Night Lift — email test",
    html: shell(content),
    text: plain(content),
    event: "email.test",
  });

  // 200 either way. A refusal is a successful diagnosis, not a server error, and
  // the panel needs the reason rather than a status code.
  return NextResponse.json({ ...result, to });
}
