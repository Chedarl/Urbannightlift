# Security

Written after a full audit of the running system in August 2026 — every one of
the 107 API routes read and classified, all 40 verification suites run, and the
dependency tree checked. This is the state of it, honestly, including the parts
that are wrong.

---

## September 2026 — the audit that mattered, and what the earlier ones missed

**The whole database was readable and writable by anybody, for the life of the
project, and every previous security round passed.**

Supabase exposes the `public` schema over PostgREST using the **anon key** —
the key that ships in the browser bundle of every page. Row Level Security was
off on all 38 tables and the default grants were in place, which makes that a
complete second API onto the same data. Probed against production before it was
closed:

```
GET   /rest/v1/Customer               200   fullName, whatsappNumber, pinHash
GET   /rest/v1/User                   200   idCardNumber, idCardFrontUrl, role
GET   /rest/v1/Order                  200   (empty then; otpCode is a column)
POST  /rest/v1/ServiceInterest        400   NOT NULL — permission had passed
PATCH /rest/v1/User {"role":"OWNER"}  204   accepted
```

Read **and** write. Anyone could have lifted the customer list with their PIN
hashes, read every rider's ID card number and document URLs, taken delivery OTPs
the moment real orders existed, marked payments verified, changed fees, or
promoted themselves to OWNER — without touching one of the 107 gated routes.

### Why four previous audits missed it

Because each of them audited **the application**, exhaustively and correctly.
Routes, gates, roles, tokens — all sound, and all beside the point. The database
was reachable through a door the application does not own and cannot see.

The lesson worth keeping is not "enable RLS". It is that **auditing the front
door proves nothing about the building**, and that a security review of a
managed-backend product has to include the backend's own surface: PostgREST,
Storage policies, and the Auth schema, not only the code in this repository.

### What was done

Two layers, because one can be undone by accident:

1. **RLS enabled with no policies** on all 38 tables — default-deny.
2. **The grants revoked outright** from `anon` and `authenticated`, so the
   privilege is absent rather than merely filtered.

Plus `ALTER DEFAULT PRIVILEGES`, which is the part that stops it returning:
without it the next table Prisma creates inherits the default grant and is
exposed again on day one.

Prisma is unaffected — it connects as `postgres`, which owns the tables and
bypasses RLS. `FORCE ROW LEVEL SECURITY` is deliberately not set. Supabase Auth
(`auth` schema) and Storage (`storage` schema) are untouched, and the app's only
Supabase calls are `.storage.from(...)`.

Migration: `prisma/migrations/20260914150000_lock_public_schema_from_anon`.

### The check that would have caught it

`scripts/verify-db-exposure.ts` asserts the property **from the outside** — not
"is the setting on" but "can a stranger with the public key read anything". It
is the one suite in this project that makes real network calls, deliberately: a
local reimplementation of PostgREST's permission model would only prove the same
bug could be written twice. It skips cleanly when no key is present.

**Rotate the keys.** The anon key was not itself the vulnerability, but it was
the credential in every request that could have exploited this, and it has been
public since launch. Rotating it in the Supabase dashboard and updating
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel is cheap and closes the window on
anything already copied.

---

## What was audited, and what it found

### Auth gating — sound

All 107 API routes were classified by the gate they use. **Every route that
mutates anything is gated**, and each unauthenticated route is legitimately
public: login, signup, the browse and search endpoints, and public order
tracking. No missing gate was found.

Verified by reading rather than assumed:

- **The delivery OTP is never selected** by `GET /api/track/[orderCode]`. It
  cannot leak from the public tracking route because it never leaves the
  database on that path.
- `POST /api/orders` enforces `isServiceEnabled` **server-side**, so a paused
  service cannot be ordered by a hand-crafted request.
- Order ownership is an HMAC cookie compared with `timingSafeEqual`.
- PIN lockout is real: 5 failed attempts, 15 minutes.
- The only `dangerouslySetInnerHTML` in the codebase is `JSON.stringify` of our
  own schema.org object. It is not a sink.
- Security headers — HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` — are
  set in `next.config.ts`.
- No `.env` file is tracked in git.

### Logic — 916 checks green

40 verification suites; 33 run without a database and **all 33 pass, 0 fail**.
The remaining 7 exercise Prisma against real rows and need a database.

---

## What was wrong, and what was done

### 1. `/api/upload` had no limit of any kind

Anyone could mint unlimited signed upload URLs for the three buckets that need
no session (guest payment proof, merchant logos, guest voice notes). With
`merchant-logos` being public-read, that is free image hosting on our
infrastructure and an unbounded storage bill.

**Fixed:** 30 mints per hour per caller, applied to everyone rather than only
guests — a stolen staff session should not be able to do this either.

**Also fixed, and this is the important half:** `ensureStorageBuckets` set
`allowedMimeTypes` and `fileSizeLimit` on every bucket, but only through
`createBucket`, **which applies its options solely when it creates the bucket**.
Every bucket in production already existed, so the "already exists" error was
swallowed and *not one of those limits was ever applied*. They read as enforced
in the source and were enforced nowhere. `updateBucket` now runs on every seed,
so the rules bind regardless of when a bucket was made.

> The API route can only advise on file type. The bytes go straight from the
> browser to Supabase with a signed URL and never pass through our server —
> which is what keeps a 10 MB scan off a serverless function. **The bucket is
> the enforcement point.** Run the DB-setup action after deploying so the limits
> are actually applied.

### 2. A merchant could put a tracking pixel on the public food page

`PATCH /api/merchant-account/shop` accepted `logoUrl` and `photoUrl` as any
string up to 500 characters, and those render inside an `<img src>` on the
public food page. A signed-in merchant could point one at their own server and
collect the IP and user-agent of every customer who browsed.

**Fixed:** `isOwnStorage()` — a stored image may only be a `bucket/key` path in
our own storage or an absolute URL on the configured Supabase host. Applied on
the merchant portal, the admin path and the public merchant signup. Proved by
`verify-security`, including the lookalike-host case (`…supabase.co.evil.example`)
that a naive suffix check would let through.

### 3. Public forms had no rate limiting

`account/signup`, `support`, `service-interest`, `merchant-signup` and
`POST /api/orders` had none. Nothing is stolen by scripting them — but the case
inbox and the needs-attention queue are the two screens this business is run
from at 1 AM, and filling them with rubbish is enough.

**Fixed:** one database-backed limiter (`src/lib/security/rateLimit.ts`), plus
the honeypot on signup, support and the waiting list.

**Corrections to the first draft of this audit**, both found on closer reading:
`/merchant/join` **did** already have a honeypot (the field is called
`companyWebsite`, which an earlier grep missed), and `rider-applications`
already requires an account.

> **Limits are deliberately generous, and the reason is Yaoundé.** Mobile data
> here puts many real customers behind a small number of carrier NAT addresses.
> A tight per-IP limit does not stop an attacker; it stops a street of paying
> customers who share an exit node. Ordering has the highest limit of all. If
> these are ever wrong, they must be wrong in the direction of letting an abuser
> through, because the other direction silently loses orders.

### 4. Signing secrets could fall back to a literal in this repository

Every signing secret ends its fallback chain at a constant published here:

```
CUSTOMER_SESSION_SECRET || SUPABASE_SECRET_KEY || DATABASE_URL || "unl-dev-…"
```

**Not currently exploitable** — Vercel always sets `DATABASE_URL`, so every chain
lands on a real secret. But if one ever reached the literal, anybody who has read
this repository could forge a customer session, an order-access cookie or a
share link, and **it would fail completely silently**, with every screen looking
healthy. Total compromise, zero signal.

**Fixed, in two ways that do not break local development:**

- `assertProductionSecrets()` runs from `src/instrumentation.ts` and **refuses to
  start** in production on a repository literal. A site that will not boot is far
  better than one that boots with forgeable sessions.
- A **Signing secrets** panel on `/admin/settings`, beside maps, mail and AI.
  Variable **names only** — never a value, a prefix or a length.

---

## Dependency advisories — revised September 2026

The August position was "defer and document": four high-severity advisories, all
transitive through Next 15.5.21, judged low-exploitability because postcss is
build-time and sharp was only reached by Next's own image optimiser "on images
we control".

**That position no longer held.** The count grew to seven, and one became
**critical: unauthenticated remote code execution in the Image Optimization API
when AVIF files are used.** The August reasoning had also quietly assumed the
optimiser was a minor surface; it was live at `/_next/image`, answering 200, and
`next.config.ts` was explicitly asking for AVIF.

What made the fix cheap was checking rather than assuming: **`next/image` is
imported nowhere in this codebase.** All thirteen images are raw `<img>` tags,
because every one is either a merchant's uploaded logo from Supabase Storage or
our own generated artwork. The optimiser was pure attack surface with no user.

So `images: { unoptimized: true }` removes the critical vector today, at no cost
and with no breaking upgrade. With it off, postcss is build-time only and sharp
is no longer reachable from a request — and deferring Next 16 becomes an honest
call again rather than a negligent one.

**Revisit when:** `next/image` is wanted (Next 16 goes in first, in that order),
or a new advisory lands that is reachable without the optimiser.

## Historic: the four advisories accepted in August

| Package | Advisories | Reached how |
|---|---|---|
| `sharp` < 0.35 | CVE-2026-33327, -33328, -35590, -35591 (libvips) | transitive via `next@15.5.21` |
| `postcss` | GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp | transitive via `next@15.5.21` |

The only clean fix is **Next 16**, a breaking upgrade.

**Decision: accepted and deferred**, deliberately, because the exposure here is
low:

- **postcss is build-time only.** It processes our own stylesheets during the
  build and never sees attacker-controlled input at runtime. The advisories
  concern `sourceMappingURL` in CSS we wrote ourselves.
- **sharp is reached only by Next's own image optimiser**, on images we control.
  Untrusted uploads are never passed through it — they go to Supabase Storage
  and are served as static objects.

Destabilising a live delivery service for a low-exploitability CVE is the wrong
trade. **Revisit when Next 16 is a few point releases old**, and take it as its
own PR so a failed upgrade can be abandoned without losing anything else.

---

## Operational checklist

Things only the owner can do. None of these can be closed from the codebase.

- [ ] **Set the six dedicated signing secrets** in Vercel:
      `CUSTOMER_SESSION_SECRET`, `MERCHANT_SESSION_SECRET`,
      `AMBASSADOR_SESSION_SECRET`, `ORDER_ACCESS_SECRET`, `WATCH_LINK_SECRET`,
      `MERCHANT_PING_SECRET`. Until then they borrow `DATABASE_URL`, which works
      but means **rotating the database password signs every customer out and
      breaks every share link in flight**. `/admin/settings` shows which is
      which.
- [ ] **Run the DB-setup action after this deploys**, so `updateBucket` applies
      the type and size limits that have never been applied.
- [ ] Keep `merchant-logos` and `rider-photos` the **only** public-read buckets.
      Everything else holds prescriptions, identity documents, payment proofs or
      voice notes.
- [ ] Rotate `KIMI_API_KEY` and the Supabase service key if either has ever been
      pasted into a chat, an email or a screenshot.

## Standing rules that must not be traded away

These predate the audit and none of it changed them:

- Never ask for or store an MTN MoMo PIN, an Orange Money secret, an OTP or a
  bank password.
- Prescriptions and parcel photos never appear in a public URL or in the shared
  order-summary PDF.
- An order is never marked paid because a payment method was selected.
- An order is never shown as insured beyond the approved coverage limit.
- The delivery OTP flow is not modified.
