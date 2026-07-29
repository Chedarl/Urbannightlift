import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendEmail, operationsInbox } from "@/lib/email/send";
import { ADMIN, plain, shell } from "@/lib/email/templates";

/**
 * POST /api/settings/test-email — prove the email path works.
 *
 * Without this the first real test of the notification system is a real
 * order at 1 AM, and if it silently fails nobody finds out. It also surfaces
 * the restriction people trip over first: an unverified Resend account can
 * only send to the address the account was registered with, and the error
 * that comes back says so in plain language rather than "failed".
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can send a test email" }, { status: 401 });
  }

  const to = await operationsInbox();
  const opts = {
    heading: "Email is working",
    subheading: "If you are reading this, orders and signups will reach you here.",
    fields: [
      { label: "Sent to", value: to },
      { label: "Requested by", value: user.fullName },
      { label: "At", value: new Date().toISOString() },
    ],
    actionLabel: "Open the dashboard",
    actionUrl: ADMIN.dashboard(),
  };

  const result = await sendEmail({
    to,
    subject: "Urban Night Lift — email is working",
    html: shell(opts),
    text: plain(opts),
    event: "settings.test_email",
  });

  if (!result.ok) {
    // Resend's own wording for the sandbox limit is opaque. Say what it means.
    const raw = result.error ?? "";
    const friendly =
      result.error === "not_configured"
        ? "No RESEND_API_KEY is set in Vercel yet, so nothing can be sent."
        : /testing emails|only send testing|verify a domain/i.test(raw)
          ? `Resend will only deliver to the address your Resend account is registered with until you verify a domain. Either set the notification email to that address, or verify urbannighlift.com in Resend.`
          : raw;
    return NextResponse.json({ ok: false, to, error: friendly }, { status: 400 });
  }

  return NextResponse.json({ ok: true, to });
}
