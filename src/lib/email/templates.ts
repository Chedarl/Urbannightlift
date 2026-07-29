import "server-only";

/**
 * The look of every operational email.
 *
 * Deliberately old-fashioned HTML — tables, inline styles, no flexbox and no
 * external CSS — because email clients are not browsers and Gmail strips
 * anything clever. Light background rather than the app's black, because a
 * dark email in a light inbox reads as spam and looks broken in preview panes.
 *
 * Every message carries the same three things: what happened, everything the
 * person typed, and one button into the admin screen where the files they
 * uploaded actually live.
 */

const SITE = "https://urbannighlift.com";
const GOLD = "#b8860b";
const INK = "#1a1130";

export interface Field {
  label: string;
  value: string | null | undefined;
}

/** Drops empty fields rather than printing a column of dashes. */
function rows(fields: Field[]): string {
  return fields
    .filter((f) => f.value != null && String(f.value).trim() !== "")
    .map(
      (f) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;width:38%;vertical-align:top;">${escape(f.label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#111;font-size:14px;font-weight:500;">${escape(String(f.value))}</td>
        </tr>`
    )
    .join("");
}

export function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shell(opts: {
  heading: string;
  subheading: string;
  fields: Field[];
  actionLabel: string;
  actionUrl: string;
  /** Shown above the button — used to say what is deliberately not in this email. */
  note?: string;
  footnote?: string;
}): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5ea;">

        <tr><td style="background:${INK};padding:18px 24px;">
          <div style="color:${GOLD};font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Urban Night Lift</div>
          <div style="color:#cfc6db;font-size:12px;margin-top:2px;">Night delivery · Yaoundé</div>
        </td></tr>

        <tr><td style="padding:24px 24px 8px;">
          <h1 style="margin:0;font-size:19px;color:#111;font-weight:700;">${escape(opts.heading)}</h1>
          <p style="margin:6px 0 0;font-size:14px;color:#666;">${escape(opts.subheading)}</p>
        </td></tr>

        <tr><td style="padding:8px 12px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rows(opts.fields)}
          </table>
        </td></tr>

        ${
          opts.note
            ? `<tr><td style="padding:16px 24px 0;">
                 <div style="background:#fff8e1;border:1px solid #f0e0a0;border-radius:8px;padding:12px;font-size:12px;color:#6b5a1a;line-height:1.5;">${escape(opts.note)}</div>
               </td></tr>`
            : ""
        }

        <tr><td style="padding:20px 24px 24px;">
          <a href="${escape(opts.actionUrl)}" style="display:inline-block;background:${GOLD};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:700;">${escape(opts.actionLabel)}</a>
        </td></tr>

        <tr><td style="padding:0 24px 22px;">
          <p style="margin:0;font-size:11px;color:#999;line-height:1.6;">
            ${opts.footnote ? escape(opts.footnote) + "<br/>" : ""}
            Sent automatically by Urban Night Lift. We never ask anyone for a MoMo PIN, an Orange secret code, a one-time code or a bank password.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** The same content as plain text, for clients that refuse HTML. */
export function plain(opts: {
  heading: string;
  subheading: string;
  fields: Field[];
  actionLabel: string;
  actionUrl: string;
  note?: string;
}): string {
  const body = opts.fields
    .filter((f) => f.value != null && String(f.value).trim() !== "")
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
  return [
    "URBAN NIGHT LIFT",
    "",
    opts.heading,
    opts.subheading,
    "",
    body,
    "",
    opts.note ?? "",
    "",
    `${opts.actionLabel}: ${opts.actionUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const ADMIN = {
  order: (id: string) => `${SITE}/admin/orders/${id}`,
  riderApplications: () => `${SITE}/admin/riders/applications`,
  ambassadors: () => `${SITE}/admin/ambassadors`,
  merchants: () => `${SITE}/admin/merchants`,
  customers: () => `${SITE}/admin/customers`,
  dashboard: () => `${SITE}/admin/dashboard`,
};

/** Said the same way every time somebody uploaded something we are not attaching. */
export const UPLOADS_NOTE =
  "Documents they uploaded — ID cards, prescriptions, payment screenshots — are not attached to this email. " +
  "They are held privately and open with one tap from the button below, once you are signed in. " +
  "Email can be forwarded and sits in an inbox nobody administers, which is the wrong place for someone's identity papers.";
