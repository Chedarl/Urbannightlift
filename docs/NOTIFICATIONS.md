# Getting told things happened

Four channels, and only two of them are free. This page is what to check when a
notification does not arrive.

| | Cost | Reaches | Status today |
|---|---|---|---|
| **Email** (Resend) | free to 3,000/month | you | live — every order, signup, application, payment |
| **Web push** | free | you, riders, customers | live, needs the app installed |
| **WhatsApp click-to-chat** | free | anyone | live — but a human taps send |
| **WhatsApp Cloud API** | ~1–2 c/message | anyone, automatically | seam built, needs Meta approval |

---

## Email is not arriving

Open **`/admin/settings`**. The mail panel shows where it is sending, what the
provider said, and has a **Send a test email** button that answers this in five
seconds instead of by deduction.

Every send has always been recorded — recipient, status and the provider's exact
refusal. That record simply had no screen until now, which is why a failure and
a success looked identical from the outside.

### The three causes, and how to tell them apart

**1. No API key.** The panel says *provider key: missing*. Nothing has ever been
sent. Add `RESEND_API_KEY` in Vercel → Settings → Environment Variables, then
**redeploy** — environment variables only take effect on a new deployment, and
skipping that is the usual reason people think it did not work.

**2. Resend refused the From address.** This is the most likely one.
`.env.example` ships:

```
EMAIL_FROM="Urban Night Lift <notifications@urbannighlift.com>"
```

**Resend will not send from a domain you have not verified.** Until
`urbannighlift.com` is verified in their console, every send is refused and the
panel quotes their reason.

Two ways out:

- *Quick:* set `EMAIL_FROM` to `Urban Night Lift <onboarding@resend.dev>`, their
  shared sender. Works immediately. The catch is that a shared sender may only
  deliver to **the address the Resend account was opened with** — so if the
  account was not opened with `urbannightlift@gmail.com`, mail to it is still
  refused. Good enough to prove the pipe works; not a permanent answer.
- *Proper:* Resend → **Domains** → add `urbannighlift.com` → add the DNS records
  they give you. The domain is on Vercel nameservers, so the records go in
  Vercel → Domains → DNS. Verification usually takes minutes. Then keep
  `EMAIL_FROM` as it is.

**3. It sent and Gmail hid it.** The panel says `SENT` and nothing arrived. That
is not this app. Check spam in the destination inbox and add a filter so the
first one that lands teaches Gmail the rest belong.

### Where it sends

Settings first, so it can change without a deploy:
`OperatingSettings.notificationEmail` → `OPERATIONS_EMAIL` →
`urbannightlift@gmail.com`. The field is on `/admin/settings`.

### What is deliberately never attached

Names, numbers, addresses and what was ordered go in the message. **ID cards,
prescriptions, parcel photos and payment screenshots never do** — they are
linked, and only open to a signed-in staff account. Email is forwardable and
lives in an inbox nobody administers, which is the wrong place for a national ID
document, and the privacy policy we publish promises those are seen only by
staff handling the order.

---

## WhatsApp

### What a `wa.me` link can and cannot do

Everything in the app today uses click-to-chat (`src/lib/whatsapp/links.ts`).
It is free and needs no account, and it has two hard limits:

- **It cannot push.** It opens WhatsApp with the message pre-typed. A human taps
  send.
- **It cannot carry a file.** No PDF, no image.

That is why the welcome card is sent as a **link** rather than an attachment,
and why sending it is a one-tap action in admin rather than something that
happens by itself.

### Making it automatic

Automatic WhatsApp means Meta's **WhatsApp Business Cloud API**, and it needs
all four of:

1. a Meta Business account with **business verification** completed,
2. a phone number dedicated to the API — *it cannot also be used in the normal
   WhatsApp app*, so **do not use +237 680038004**,
3. a **message template** submitted and approved (usually a day or two),
4. payment details on the Meta account.

Meta has billed business-initiated messages since **1 July 2025**. Utility
templates to Cameroon are on the order of a cent or two each, so at this volume
the cost is negligible — the delay is approval, not money. Customer-initiated
conversations, and utility templates sent inside the 24 hours after a customer
messages you, remain free.

### Switching it on

The code is already written and sits behind one variable:

```
WHATSAPP_PROVIDER=cloud
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_WELCOME_TEMPLATE=welcome_card
```

Unset, or set to `link`, nothing sends by itself and admin keeps its one-tap
button. Set to `cloud`, signup sends the welcome on its own. **Nothing else
changes**, and a send that fails is recorded rather than thrown — a signup must
never fail because a notification did.

Every attempt lands in the same log the email panel reads, so the moment it is
switched on it is as diagnosable as email is.

---

## Web push

Free on both platforms now, with one condition worth stating to riders: **on
iPhone, notifications only work once the app has been added to the Home
Screen.** Android needs nothing. Keys are `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`; subscriptions that return 404 or 410 are
pruned automatically.
