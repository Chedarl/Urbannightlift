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

Nothing, at this volume. Autocomplete sessions are free and unlimited; Place
Details and Geocoding get 10,000 free calls a month each (we use roughly 1,800
and 900 at 900 orders); 2D tiles get 100,000 free tiles a month. We deliberately
do not use the Maps JavaScript API, which is the expensive one at $7 per 1,000
map loads — Leaflet stays the renderer and we buy tiles instead.

## If it stays on OpenStreetMap

Nothing breaks. The site keeps working on the free OpenStreetMap basemap, search
falls back to our own catalogue and Nominatim, and orders complete normally. The
only loss is that OpenStreetMap knows far less of Yaoundé than Google does —
which is the whole reason for paying, and why it is worth getting right.
