# Turning the maps from OpenStreetMap to Google

If `/admin/settings` says **"Maps: OpenStreetMap"**, this is the page.

## The mistake almost everyone makes

There are two kinds of Google Maps call in this app, and they need **opposite**
key restrictions:

| Call | Made by | Referrer restriction |
|---|---|---|
| Creating the tile session | **our server** | **breaks it** — a server sends no referrer |
| Fetching each map tile | the **browser** | works, and is recommended |
| Address search, geocoding | **our server** | **breaks it** |

So a single key restricted to `urbannighlift.com` will *look* correctly locked
down and will silently leave the maps on OpenStreetMap forever. That is the
failure this document exists to prevent, and it is the one that already happened
here.

## Getting it working (do this first)

Start with **one unrestricted key**. Prove the maps turn Google, then tighten.
Debugging a restriction model while trying to launch is the wrong order.

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project.
2. **Enable billing on it.** Map Tiles will not work without a billing account
   attached, even entirely inside the free tier. This is the second most common
   cause of "Maps: OpenStreetMap".
3. APIs & Services → Library → enable all three:
   - **Map Tiles API**
   - **Places API (New)** — the one called "(New)", not the legacy Places API
   - **Geocoding API**
4. Credentials → Create credentials → API key.
5. Set **API restrictions** to those three APIs. Leave **Application
   restrictions** on *None* for now.
6. Vercel → Settings → Environment Variables → add `GOOGLE_MAPS_API_KEY` →
   **Redeploy**.
7. Open `/admin/settings`. It should now say **"Maps: Google"**.

## Tightening it afterwards

Once it works, split into two keys so the public one can do less:

**`GOOGLE_MAPS_TILES_KEY`** — goes in the tile URL the browser fetches, so it is
public by necessity, the same as the key in any Google-powered page's source.
- Application restrictions: **Websites**, `urbannighlift.com/*`
- API restrictions: **Map Tiles API** only

**`GOOGLE_MAPS_SERVER_KEY`** — used only from our server, never sent to a
browser.
- Application restrictions: **None**
- API restrictions: Map Tiles, Places (New), Geocoding

Add both, remove `GOOGLE_MAPS_API_KEY`, redeploy, and check `/admin/settings`
again. If it goes back to OpenStreetMap, the server key has a restriction on it.

## Reading the error

`/admin/settings` quotes Google's own words, which is what tells the four
possible problems apart:

| What it says | What to do |
|---|---|
| "No Google Maps key is configured." | Nothing is set in Vercel, or you didn't redeploy after adding it. |
| "API keys with referer restrictions cannot be used with this API" | The server key has a website restriction. Remove it. |
| "This API project is not authorized" / "API ... is not enabled" | Enable the Map Tiles API on the project. |
| "Billing has not been enabled" | Attach a billing account. Free tier still needs one. |
| "Couldn't reach Google: …" | Network or outage. It retries by itself. |

A rejected key is remembered for five minutes before retrying, so one
misconfiguration doesn't turn into thousands of calls. After fixing something,
wait five minutes or redeploy.

## What it costs

Nothing, at this volume.

| SKU | Free each month | Then | We use, at ~900 orders |
|---|---|---|---|
| Autocomplete (per session) | **unlimited** | — | all of it |
| Place Details (Essentials) | 10,000 | $5 / 1,000 | ~1,800 |
| Geocoding | 10,000 | $5 / 1,000 | ~900 |
| Map Tiles (2D) | 100,000 tiles | $0.60 / 1,000 | comfortably under |
| ~~Dynamic Maps (JS SDK)~~ | 10,000 loads | **$7 / 1,000** | **not used** |

That last row is the whole cost story. Dynamic Maps is the expensive product and
the one most sites reach for; we keep Leaflet as the renderer and buy raw tiles
instead, which is roughly a tenth of the price and is what makes this free rather
than merely cheap.

The first thing that would ever cost money is tiles, at somewhere around 3,000
orders a month — call it $50. Everything else stays inside the free tier well
past that.

**The apps do not add to any of this.** The customer app loads the website, so a
customer using the app costs exactly what the same customer costs in a browser.
The rider app renders no map at all — it opens `google.com/maps/dir/…`, a plain
link that hands off to the rider's own Google Maps app, which is free, unmetered
and needs no key.

## Cap what you can be charged

Google makes you attach a card even for the free tier, and that — not the usage —
is the part worth defending against. Two settings, five minutes, and the
exposure is closed:

**1. A budget alert.** Billing → Budgets & alerts → Create budget. Set it to
$1 and tick the alert thresholds. You will get an email the moment anything is
billed at all, which at this volume should be never. This warns; it does not
stop.

**2. Quota caps — the one that actually stops it.** APIs & Services → each API →
Quotas → set a daily limit:

| API | Daily cap | Why |
|---|---|---|
| Map Tiles | 3,000 | ~90k/month, just inside the free 100k |
| Places (New) | 300 | ~9k/month, inside the free 10k |
| Geocoding | 300 | ~9k/month, inside the free 10k |

Past the cap Google returns an error, our code falls back to OpenStreetMap and
the catalogue, and **you are charged nothing**. The site keeps working. A hard
cap that degrades gracefully is strictly better than a bill you find out about
later, and this app was built to degrade at every one of those points.

Raise the caps when real usage approaches them — the readout on
`/admin/settings` will start reporting quota errors, which is your signal.

## If it stays on OpenStreetMap

Nothing breaks. The site keeps working on the free OpenStreetMap basemap, search
falls back to our own catalogue and Nominatim, and orders complete normally. The
only loss is that OpenStreetMap knows far less of Yaoundé than Google does —
which is the whole reason for paying, and why it is worth getting right.
