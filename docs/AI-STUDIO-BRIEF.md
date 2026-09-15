# Briefing Google AI Studio on the order screens

## What this document is for

You want the three live order pages — food, pharmacy, small parcel — made
beautiful, with real Yaoundé businesses in them rather than placeholders. This
is the brief to hand AI Studio, and, just as importantly, the list of things
**not** to hand it.

## Read this part first: what AI Studio cannot do here

**It cannot see this repository.** AI Studio builds standalone apps from a
prompt. Asked to "build the three order forms", it will produce a separate
application that does not share this codebase's Prisma schema, design tokens,
`fare.ts`, authentication, or the 64 verification suites — and none of it can be
pasted into the live app. That is not a criticism of the tool; it is what it is
for.

**The order forms are also not the part that is missing.** They were rebuilt in
v49 and v50 and now carry the pinned cart bar, live fare quoting, the payment
selector, the courier tip and slide-to-confirm. What is missing is *content*:
the catalogue is empty, `Merchant.logoUrl` is null everywhere, and `artworkFor`
draws generated tiles because there are no photographs.

So the split is:

- **Use AI Studio for visual direction** — mockups of the three screens to react
  to, given our real tokens and real merchant names.
- **Do not use it to write the screens** — they exist, they are tested, and they
  will look finished the moment there is real data behind them.

## Three things that must not be pasted into AI Studio

**`DATABASE_URL`.** Ours points at the production Supabase database: real
customer names, WhatsApp numbers, delivery addresses, PIN hashes, and rider
ID-document paths. A third-party build environment given that string has read
*and write* access to all of it. If AI Studio needs a database, point it at a
throwaway one — see "A scratch database" below.

**Any Supabase service key, or `CALL_CHANNEL_SECRET`.** Same reasoning.

**`USE_MOCK_DATA`.** Not dangerous, just meaningless — nothing in this
repository reads it. It comes from AI Studio's own project template.

## `GOOGLE_MAPS_API_KEY`

This one has to be created by you, in the Google Cloud Console, against a
project with billing enabled. Nobody can generate it on your behalf.

It is already wired here — `src/lib/maps/google.ts` does Places (New)
autocomplete, place details and geocoding, and `/admin/settings` reports whether
Maps is live. **`docs/MAPS-SETUP.md` is the setup guide**; follow that rather
than anything AI Studio suggests, because the two-key split it describes
(`GOOGLE_MAPS_TILES_KEY` for the browser, `GOOGLE_MAPS_SERVER_KEY` for the
server) is about *where the call is made*, which a generic guide will get wrong.

Enable **Places API (New)** on the key if you want to run the catalogue
gatherer — text search is billable per request.

## A scratch database

Rather than the production URL:

```bash
# A local Postgres, the same way the verification suites run:
export DATABASE_URL="postgresql://postgres@localhost:5433/unl?schema=public&host=/tmp"
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy
npx prisma db seed
```

`SEED_ADMIN_PASSWORD` and `SEED_RIDER_PASSWORD` set the staff logins the seed
creates (`prisma/seed.ts`). Generate them rather than typing something:

```bash
openssl rand -base64 24
```

Put them in a local `.env` — which `.gitignore` already covers. `.env.example`
keeps `"change-me"` on purpose: it is a template, and a real value in it is a
real value in the repository. **These are for a throwaway database only.** Do
not reuse them anywhere that matters.

## Getting real merchants

```bash
npx tsx scripts/gather-merchants.ts --dry      # what it would search, and what that costs
npx tsx scripts/gather-merchants.ts            # for real, needs the Places key
```

It writes `prisma/data/merchants.yaounde.<date>.json` and **never touches the
database**. Read the file before any of it is seeded: listing a business is a
claim that we deliver for them.

It gathers names, addresses, coordinates, opening hours and phone numbers —
facts, which Places licenses us to use. It deliberately gathers **no photos and
no logos**, and this is worth understanding rather than working around:

- Places photos carry attribution and caching conditions a seeded JSON file
  cannot honour.
- Google Search results are not licensed for scraping.
- A restaurant's logo is its trademark. Putting Tchop et Yamo's mark on our
  order page asserts a relationship we do not have, and is the kind of thing
  that ends in a letter rather than a conversation.

The licit route to a merchant's logo is the merchant uploading it, which
`Merchant.logoUrl` and the existing onboarding already support. Until a business
has signed up, the generated artwork stays — which is also why it exists.

## The actual prompt for AI Studio

> Design three mobile screens (390×844) for a night-time delivery service in
> Yaoundé, Cameroon, operating 18:00–04:00. Dark interface, near-black violet
> ground, gold used only for money, violet for actions, a single accent per
> screen. Text never smaller than 13px — it is read one-handed, outdoors, at
> night.
>
> **Screen 1 — choosing a restaurant.** A list of real Yaoundé restaurants
> [paste names from the gathered file]. Each row: name, quartier, distance,
> estimated arrival. No star ratings — we have no ratings data. No photographs —
> assume none exist, and design the row to look deliberate without one.
>
> **Screen 2 — a pharmacy order.** A customer names what they need; some items
> need a prescription photographed. The uploaded photo is private and must never
> appear in anything shareable.
>
> **Screen 3 — a small parcel.** Pickup, drop-off, what is in it, declared
> value. Insurance is capped, and the cap has to be legible rather than buried.
>
> Every screen keeps a pinned bottom bar showing the delivery fee and the way
> forward. Prices are in XAF, grouped with a space: `1 500 XAF`.

Take the *composition* from what comes back — spacing, hierarchy, how a row
without a photograph is made to look intentional. Colours and type come from
`src/app/globals.css`, which is the real system and already enforced by
`verify-design-tokens`.

## What to hand back to this codebase

Screenshots and descriptions, not code. The implementation stays here, where
the fare module, the account gate, the OTP flow and the suites are.
