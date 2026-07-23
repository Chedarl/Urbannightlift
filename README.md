# Urban Night Lift

Night-only delivery service for Yaoundé 6, Cameroon (8:00 PM – midnight). Mobile-first
web app / PWA covering four sides in one codebase:

- **Customer** — place & track orders (food, medicine, groceries, urgent items, errands,
  merchant deliveries) with no account required.
- **Dispatcher / Admin** — review, approve/reject, assign riders, verify payments manually,
  manage zones/pricing, merchants, incidents, staff, and operating mode.
- **Rider** — see only assigned orders, step through pickup → delivery with OTP / photo proof.
- **Merchant** — admin-managed verified merchant directory (no merchant login in this MVP).

Brand: purple, gold, deep black. Bilingual **English (default) + French**.

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS
- Prisma ORM + PostgreSQL (Supabase in production)
- Supabase Auth (staff login) + Supabase Storage (proof photos / screenshots)
- WhatsApp via `wa.me` deep links (main + admin numbers)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the values:
   - `DATABASE_URL` / `DIRECT_URL` — Supabase Postgres (Connect panel; transaction pooler
     for `DATABASE_URL` with `?pgbouncer=true`, session pooler for `DIRECT_URL`).
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`.
   - `SEED_ADMIN_PASSWORD`, `SEED_RIDER_PASSWORD`.
3. Apply the schema and seed:
   ```bash
   npx prisma migrate deploy   # or: npx prisma migrate dev
   npx prisma db seed
   ```
   The seed creates the operating-settings singleton (mode `CLOSED`), Yaoundé 6 zones,
   sample verified merchants, two Supabase Auth staff accounts (owner + rider), and the
   private storage buckets `order-screenshots` and `delivery-proofs`.
4. Run:
   ```bash
   npm run dev
   ```

### Seeded logins

- Owner / dispatcher: `admin@urbannightlift.cm` (password = `SEED_ADMIN_PASSWORD`)
- Rider: `rider1@urbannightlift.cm` (password = `SEED_RIDER_PASSWORD`)

## Key modules

- `prisma/schema.prisma` — full data model (orders, payments, zones, merchants, incidents,
  status history, delivery proofs, operating settings).
- `src/lib/orders/statusMachine.ts` — the 15-step order workflow, allowed transitions,
  role gating, delivery-proof enforcement.
- `src/lib/orders/statusLabels.ts` — maps detailed statuses to the 9 friendly
  customer-facing labels.
- `src/lib/whatsapp/buildOrderMessage.ts` — exact WhatsApp order-message template.
- `src/lib/i18n/legal.ts` — verbatim bilingual insurance / legal disclaimers.
- `src/middleware.ts` — gates `/admin/**` and `/rider/**` behind a Supabase session.

## Security notes

- The app never asks for or stores MoMo PIN, Orange Money secret code, OTP, bank password,
  or any private financial credential.
- Payment is only ever marked **Verified** manually by an admin who enters a verification
  note after checking evidence out-of-band — never auto-confirmed from customer text.
- Goods are insured up to XAF 25,000; higher values must be declared and accepted.

## Out of scope (MVP)

Branded order-image generation, real payment gateway/webhook integration, WhatsApp Business
API, native mobile builds, merchant login, distance-based pricing. The schema leaves clean
seams (`Payment.verificationMethod = WEBHOOK`, `providerReference`) for a future payment API.
