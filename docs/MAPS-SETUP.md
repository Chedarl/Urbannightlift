# The map

If `/admin/settings` says **"Maps: OpenStreetMap"**, this is the page.

## Three providers, in order

The app tries them in this order and falls through automatically. Nothing here
is required — with no key at all the site works exactly as it always has.

| | Card needed | Free each month | Setup |
|---|---|---|---|
| **MapTiler** ← start here | **No** | 100,000 tiles | one key, five minutes |
| Google | Yes | 100,000 tiles | billing account, two keys, a session |
| OpenStreetMap / CARTO | No | unlimited | none — the floor |

**Use MapTiler.** Google Cloud billing rejects most Cameroonian cards, which
puts Google out of reach indefinitely rather than temporarily, and MapTiler
needs no card at all.

That is not settling for less. **Yango runs on Yandex Maps, which is itself
built on OpenStreetMap** — the same data underneath ours. What makes their map
look good is styling, not better data, and styling is exactly what MapTiler
gives us.

---

## MapTiler (5 minutes, no card)

1. Go to **[cloud.maptiler.com](https://cloud.maptiler.com)** → **Sign up**.
   Email and password. It does not ask for billing details.
2. Confirm the email.
3. On the dashboard, open **Keys** in the sidebar. There is already a key called
   *Default*. Copy it.
4. Click that key to open it, and under **Origins** add
   `https://urbannighlift.com/*` — the key is fetched by the browser, so this is
   what stops anyone else spending your allowance. Unlike Google, this
   restriction is safe here: nothing on our server uses this key.
5. Vercel → **Settings** → **Environment Variables** → add:
   - Name: `MAPTILER_KEY`
   - Value: the key you copied
   - Tick all three environments → **Save**
6. Vercel → **Deployments** → **⋯** on the latest → **Redeploy**.
7. Open `/admin/settings`. It should say **"Maps: MapTiler"**.

Environment variables only take effect on a new deployment. Skipping step 6 is
the usual reason people think it did not work.

### Making it yours

`dark-matter` is the default style and the closest ready-made match to this
app's palette. To have the map drawn in exactly the violet/gold system, build a
style in MapTiler Cloud (**Maps** → **Customize**) and put its id in
`MAPTILER_STYLE`. Nothing else changes.

### What it costs

Nothing at your volume. 100,000 tiles a month free; a map view is roughly 10–20
tiles, so that is thousands of orders. MapTiler cannot charge you without you
choosing a paid plan — there is no card on file to charge.

---

## Google (only if a card ever works)

Kept wired and one variable away, because Google's street and business data in
Yaoundé is genuinely the best available. If a card is accepted later:

1. Cloud console → project → **enable billing** (required even inside the free
   tier, and it gives no hint when it is missing).
2. Enable **Map Tiles API**, **Places API (New)**, **Geocoding API**.
3. Create a key. API restrictions: those three. **Application restrictions:
   None.**
4. Vercel → `GOOGLE_MAPS_API_KEY` → redeploy.

MapTiler wins when both are set, so remove `MAPTILER_KEY` if you want Google to
take over.

### The restriction that catches everyone

Google needs **two different kinds of call**, and they want opposite
restrictions:

| Call | Made by | Referrer restriction |
|---|---|---|
| Creating the tile session | **our server** | **breaks it** — servers send no referrer |
| Fetching each tile | the **browser** | works, and is recommended |
| Address search, geocoding | **our server** | **breaks it** |

A single key restricted to `urbannighlift.com` looks correctly locked down and
silently leaves the maps on OpenStreetMap. Once it works, split into
`GOOGLE_MAPS_TILES_KEY` (referrer-restricted, Map Tiles only) and
`GOOGLE_MAPS_SERVER_KEY` (no application restriction).

None of this applies to MapTiler, which makes no server-side call at all.

### Capping the spend

Google makes you attach a card even for the free tier, and that — not the usage —
is the part worth defending against. APIs & Services → each API → Quotas → set a
daily limit: **Map Tiles 3,000**, **Places (New) 300**, **Geocoding 300**. Each
sits just inside its free monthly allowance. Past the cap Google errors, the app
falls back, and you are charged nothing. Add a $1 budget alert under Billing as a
backstop.

---

## Reading the error

`/admin/settings` quotes the provider's own words and has a **Re-check** button
that retries immediately rather than making you wait out the five-minute memo.

| What it says | What to do |
|---|---|
| "No MAPTILER_KEY and no Google Maps key are configured." | Nothing is set in Vercel, or you did not redeploy after adding it. |
| "API keys with referer restrictions cannot be used with this API" | The Google server key has a website restriction. Remove it. |
| "This API project is not authorized" / "is not enabled" | Enable the Map Tiles API on the Google project. |
| "Billing has not been enabled" | Attach a billing account to the Google project. |
| "Couldn't reach …" | Network or outage. It retries by itself. |

If tiles fail in the **browser** rather than on the server — a key restricted to
the wrong origin — the map falls back to OpenStreetMap after a few failed tiles
rather than showing an empty grid. Check the browser console for 401/403 on tile
requests.

---

## What none of this fixes

Addresses in Yaoundé are landmarks, not postal lines: *"behind the Total station
at Rond-Point Express, blue gate"*. **No provider geocodes that** — not
MapTiler, not Google.

What does is your own address book, and it already ranks above every third
party:

1. **Places you have delivered to.** Every completed delivery writes the rider's
   GPS back against the address the customer typed, so the same address resolves
   better next time. This compounds — the operation is measurably more accurate
   in six months with nobody doing anything.
2. **The location catalogue**, managed at `/admin/locations`.
3. Only then anything external.

`/admin/locations` lists the addresses customers typed that we **failed** to
resolve, most frequent first. Working through that list is worth more than any
map provider you could buy.
