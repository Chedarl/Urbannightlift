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

The default style is **`streets-v2-dark`** — street names and landmarks stay
legible on a phone at 1 AM, which is the detail this is being paid for.

To use a different one, put its id in `MAPTILER_STYLE`. **Style ids do not
transfer between providers.** `dark-matter` is *CARTO's* name for their dark
style; MapTiler has no such map, and using it was a real bug — every tile 404'd,
the browser fell back to OpenStreetMap, and the panel went on saying MapTiler
was live. These ids are checked working:

| Id | Looks like |
|---|---|
| `streets-v2-dark` ← default | dark, full street detail |
| `basic-v2-dark` | dark, quieter |
| `dataviz-dark` | dark, very muted — pretty, fewer labels |
| `toner-v2` | high-contrast black and white |
| `backdrop` | soft, minimal |
| `streets-v2`, `bright-v2`, `basic-v2` | daylight |
| `hybrid`, `satellite` | imagery |

For the exact violet/gold system, build a style in MapTiler Cloud (**Maps** →
**Customize**) and put its id in `MAPTILER_STYLE`. Nothing else changes.

If the id is wrong, `/admin/settings` now says so by name instead of claiming
MapTiler is live.

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

## Reading the panel

`/admin/settings` reports **two** things, and they can disagree:

1. **Which provider the server chose** — and, if it is not the one you set up,
   that provider's own words about why.
2. **Whether a real tile loaded in the browser you are reading this on.** The
   panel fetches one tile of Yaoundé, the same way the map does, from the same
   origin a customer would.

The second line is there because of a day lost to the first one being right on
its own terms and wrong about what customers saw. **If they disagree, believe
the browser** — it is the one drawing the map.

There is a **Re-check** button that retries immediately rather than making you
wait out the five-minute memo.

| What it says | What to do |
|---|---|
| "No MAPTILER_KEY and no Google Maps key are configured." | Nothing is set in Vercel, or you did not redeploy after adding it. |
| "MapTiler has no style called …" | `MAPTILER_STYLE` is not a real id. Use one from the table above. |
| "MapTiler rejected the key … as invalid" | Wrong or deleted key. Copy it again from cloud.maptiler.com → Keys. |
| "MapTiler refused our server (no Referer)" | **Nothing.** Your origin restriction is working; browsers are unaffected. |
| "could not load a … tile" (browser line) | Console → look at the tile request's status. See below. |
| "API keys with referer restrictions cannot be used with this API" | The Google server key has a website restriction. Remove it. |
| "This API project is not authorized" / "is not enabled" | Enable the Map Tiles API on the Google project. |
| "Billing has not been enabled" | Attach a billing account to the Google project. |
| "Couldn't reach …" | Network or outage. It retries by itself. |

### 403 and 404 are completely different problems

Both leave you on OpenStreetMap, and they have nothing to do with each other:

| Status on a tile | Means | Fix |
|---|---|---|
| **404** | the style id does not exist | correct `MAPTILER_STYLE` |
| **403** from a browser | the key is restricted to an origin this page is not on | add the origin in MapTiler → Keys |
| **403** from our server | expected, and harmless — servers send no `Referer` | nothing |

That last row is why the server-side check treats a plain 403 as *fine* and
stays on MapTiler. Treating it as a failure would break the correctly locked-down
setup you were told to build.

If tiles fail in the browser, the map falls back to OpenStreetMap after a few
failed tiles rather than showing an empty grid — so a misconfiguration always
costs you a plainer map, never a blank one.

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
