import "server-only";

import { recordNotification } from "@/lib/email/send";
import { buildWaLink } from "@/lib/whatsapp/links";

/**
 * Sending a message to somebody's WhatsApp — and what that actually costs.
 *
 * The whole app has always used click-to-chat (`src/lib/whatsapp/links.ts`).
 * It is free, needs no account, and has two limits worth stating plainly
 * because they decide this module's whole shape:
 *
 *  - **it cannot push** — it opens WhatsApp with the text already typed, and a
 *    human taps send;
 *  - **it cannot carry a file** — no PDF, no image, which is why the welcome
 *    card travels as a link rather than an attachment.
 *
 * Actually pushing a message means Meta's WhatsApp Business Cloud API: a
 * verified Meta Business account, a number dedicated to the API (it cannot also
 * be used in the normal WhatsApp app, so not the line printed on our own
 * receipts), and a template approved in advance. Meta has billed
 * business-initiated messages since 1 July 2025 — a cent or two per utility
 * template to Cameroon, so at this volume the cost is nothing and the obstacle
 * is approval time.
 *
 * So both live here behind one interface. `link` is the default and sends
 * nothing by itself; `cloud` sends for real. The day the template is approved,
 * one environment variable changes and signup starts welcoming people on its
 * own, with no code touched.
 *
 * **Nothing here may throw.** Every caller has already done real work — an
 * account exists, a business joined — and a notification is never worth undoing
 * that.
 */

export type WhatsAppProvider = "link" | "cloud";

export function whatsappProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === "cloud" ? "cloud" : "link";
}

export interface WhatsAppResult {
  /** True only when a message genuinely left for somebody's phone. */
  sent: boolean;
  /** Present on the `link` provider: what a human should tap to send it. */
  link?: string;
  error?: string;
}

/**
 * Sends one message, or hands back the link for a human to send.
 *
 * `templateParams` are the ordered `{{1}}`, `{{2}}` … values of the approved
 * template. They must match what Meta approved, which is why the plain-text
 * body and the parameters are passed separately rather than one being derived
 * from the other — a template whose text we edited locally is a template that
 * gets rejected at send time.
 */
export async function sendWhatsApp(opts: {
  to: string;
  event: string;
  /** What the message says, for the click-to-chat path and for the log. */
  body: string;
  templateName?: string;
  templateParams?: string[];
  locale?: "en" | "fr";
  entityType?: string;
  entityId?: string;
}): Promise<WhatsAppResult> {
  const digits = opts.to.replace(/[^\d]/g, "");
  if (digits.length < 8) {
    return { sent: false, error: "No usable WhatsApp number." };
  }

  if (whatsappProvider() === "link") {
    // Not a failure and not a send — a message waiting for somebody to tap it.
    // Deliberately unlogged: a log row per generated link would bury the real
    // sends, and nothing has actually been dispatched yet.
    return { sent: false, link: buildWaLink(digits, opts.body) };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const template = opts.templateName ?? process.env.WHATSAPP_WELCOME_TEMPLATE;

  if (!phoneNumberId || !token || !template) {
    const error = "WHATSAPP_PROVIDER is cloud but the Meta credentials or template name are missing.";
    await log(opts, digits, "FAILED", { error });
    return { sent: false, error };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: "template",
        template: {
          name: template,
          language: { code: opts.locale === "fr" ? "fr" : "en" },
          components: opts.templateParams?.length
            ? [
                {
                  type: "body",
                  parameters: opts.templateParams.map((text) => ({ type: "text", text })),
                },
              ]
            : undefined,
        },
      }),
    });

    const data = (await res.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      // Meta's own message is the value here: it distinguishes an unapproved
      // template from an expired token from a number that has no WhatsApp.
      const error = data?.error?.message ?? `Meta refused the message (HTTP ${res.status}).`;
      await log(opts, digits, "FAILED", { error });
      return { sent: false, error };
    }

    const providerId = data?.messages?.[0]?.id;
    await log(opts, digits, "SENT", { providerId });
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    await log(opts, digits, "FAILED", { error });
    return { sent: false, error };
  }
}

function log(
  opts: { event: string; body: string; entityType?: string; entityId?: string },
  to: string,
  status: string,
  extra: { providerId?: string; error?: string }
): Promise<void> {
  return recordNotification({
    channel: "WHATSAPP",
    to,
    event: opts.event,
    // The first line only. A log is read to see what happened, not to re-read
    // the message.
    subject: opts.body.split("\n")[0]?.slice(0, 120),
    status,
    entityType: opts.entityType,
    entityId: opts.entityId,
    ...extra,
  });
}
