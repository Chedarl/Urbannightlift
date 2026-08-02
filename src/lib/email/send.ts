import "server-only";

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

/**
 * Operational email, and the record that it was sent.
 *
 * Two rules hold everywhere in this module.
 *
 * **A failed email must never fail the thing it was reporting.** An order is
 * worth more than a notification about an order, so every send is wrapped and
 * every failure is recorded rather than thrown.
 *
 * **Sensitive material stays behind the login.** These messages carry what a
 * person typed — names, numbers, addresses, what they ordered — but never the
 * files they uploaded. An ID card, a prescription or a payment screenshot is
 * linked, not attached. Email is forwardable, lives in an inbox nobody
 * administers, and is exactly the wrong place for a national ID document; the
 * privacy policy we publish promises those are seen only by staff handling the
 * order, and attaching them here would make that promise false.
 */

const FROM = process.env.EMAIL_FROM || "Urban Night Lift <onboarding@resend.dev>";
const FALLBACK_TO = "urbannightlift@gmail.com";

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * What is configured, for the admin readout — never the key itself.
 *
 * `from` is the single most common cause of mail silently not arriving: Resend
 * refuses any address on a domain that has not been verified in their console,
 * and the default in `.env.example` names a domain that has to be verified
 * first. Showing it beside the send log is what makes that diagnosable instead
 * of guessable.
 */
export function mailConfig(): { from: string; hasApiKey: boolean } {
  return { from: FROM, hasApiKey: Boolean(process.env.RESEND_API_KEY) };
}

/** Where operational mail goes. Settings first, so it can change without a deploy. */
export async function operationsInbox(): Promise<string> {
  try {
    const settings = await prisma.operatingSettings.findUnique({
      where: { id: 1 },
      select: { notificationEmail: true },
    });
    return settings?.notificationEmail?.trim() || process.env.OPERATIONS_EMAIL?.trim() || FALLBACK_TO;
  } catch {
    return FALLBACK_TO;
  }
}

/**
 * Sends one message and records the attempt either way.
 *
 * Returns rather than throws: the caller is always some piece of real work
 * that has already succeeded.
 */
export async function sendEmail(opts: {
  to?: string;
  subject: string;
  html: string;
  text: string;
  event: string;
  entityType?: string;
  entityId?: string;
  replyTo?: string;
}): Promise<SendResult> {
  const to = opts.to ?? (await operationsInbox());
  const apiKey = process.env.RESEND_API_KEY;

  // Not configured is a normal state, not an error — the app must run without
  // an email provider. It is still logged, so the gap is visible rather than
  // silent.
  if (!apiKey) {
    await record({ ...opts, to, status: "FAILED", error: "RESEND_API_KEY is not set" });
    return { ok: false, error: "not_configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });

    if (error) {
      await record({ ...opts, to, status: "FAILED", error: error.message });
      return { ok: false, error: error.message };
    }

    await record({ ...opts, to, status: "SENT", providerId: data?.id });
    return { ok: true, id: data?.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    await record({ ...opts, to, status: "FAILED", error: message });
    return { ok: false, error: message };
  }
}

async function record(entry: Parameters<typeof recordNotification>[0]): Promise<void> {
  return recordNotification(entry);
}

/**
 * One row per message this business tried to send, whatever the channel.
 *
 * Exported so WhatsApp lands in the same table as email rather than a second
 * one — the admin panel reads this log, and a channel that keeps its own record
 * somewhere else is a channel nobody can diagnose.
 */
export async function recordNotification(entry: {
  to: string;
  subject?: string;
  event: string;
  status: string;
  channel?: string;
  providerId?: string;
  error?: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        channel: entry.channel ?? "EMAIL",
        event: entry.event,
        recipient: entry.to,
        subject: entry.subject,
        status: entry.status,
        providerId: entry.providerId ?? null,
        error: entry.error?.slice(0, 500) ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
      },
    });
  } catch {
    // If even the log fails there is nothing useful left to do, and the work
    // that triggered this must still succeed.
  }
}
