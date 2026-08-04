import "server-only";

/**
 * MapTiler — the basemap that needs no card.
 *
 * Google Cloud billing rejects most Cameroonian cards, which put Google out of
 * reach indefinitely rather than temporarily. MapTiler signs up with no billing
 * details at all, gives 100,000 tiles a month free, and — the part that
 * matters — lets us hand it a style, so the map is drawn in this product's own
 * night palette instead of a generic dark theme.
 *
 * That is not a compromise, it is what the reference app does. Yango runs on
 * Yandex Maps, which is itself built on OpenStreetMap — the same data CARTO
 * already draws for us. What makes their map look good is styling and
 * rendering, not better data. This buys exactly that.
 *
 * ## Why this is simpler than Google was
 *
 * There is **no session to create**. Google needed a server-side POST to mint a
 * session token, which is why its key could not be referrer-restricted and why
 * the maps sat silently on OpenStreetMap for a day. MapTiler is a plain tile
 * URL: one key, used only by the browser, restricted by **origin** — which is
 * the correct and effective restriction for a browser-fetched tile.
 *
 * The key is public by necessity, exactly like Google's tiles key and like the
 * key in any Mapbox or MapTiler site's page source. Restricting it to
 * `urbannighlift.com` in MapTiler's console is the mitigation, and unlike
 * Google's case there is nothing it can break.
 */

/**
 * The style the tiles are rendered in.
 *
 * Was `dark-matter`, which is **CARTO's** name for their dark style and does not
 * exist at MapTiler — every tile 404'd, the browser fell back to CARTO, and the
 * map looked unchanged while the server insisted MapTiler was live. Style ids do
 * not transfer between providers; each one's are its own.
 *
 * `streets-v2-dark` over the prettier, more muted `dataviz-dark` and
 * `basic-v2-dark` because this is a delivery app: street names and landmarks
 * have to stay legible on a phone at 1 AM, and that detail is the whole thing
 * being paid for. A bespoke style built in MapTiler Cloud drops in via
 * `MAPTILER_STYLE` with nothing else changing.
 */
const DEFAULT_STYLE = "streets-v2-dark";

export function maptilerKey(): string | null {
  return process.env.MAPTILER_KEY || null;
}

export function maptilerStyle(): string {
  return process.env.MAPTILER_STYLE || DEFAULT_STYLE;
}

export interface MapTilerConfig {
  url: string;
  attribution: string;
  /** The same area from above. Null on any provider that has no satellite. */
  satelliteUrl?: string;
}

/**
 * The raster tile URL template for Leaflet.
 *
 * `{z}/{x}/{y}` are left for Leaflet to substitute. `@2x` asks for retina
 * tiles, which is what a phone actually wants — a delivery app is read on a
 * 390px screen at arm's length, and half-resolution labels are the difference
 * between reading a street name and squinting at one.
 *
 * Returns null rather than throwing when unconfigured, so the caller falls
 * through to the next provider. Every layer of this stack degrades.
 */
export function maptilerConfig(): MapTilerConfig | null {
  const key = maptilerKey();
  if (!key) return null;

  const style = maptilerStyle();

  return {
    url: `https://api.maptiler.com/maps/${encodeURIComponent(style)}/{z}/{x}/{y}@2x.png?key=${encodeURIComponent(key)}`,
    // Yaoundé has few named streets and fewer street numbers, so a street map
    // is often the *worse* picture: people recognise their own roof, their
    // compound wall and the shape of the yard next door. Included on the same
    // free plan as the streets, so it costs nothing to offer both.
    satelliteUrl: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`,
    // Required by MapTiler's terms, and the OpenStreetMap credit under it is
    // required by ODbL. Both must stay visible.
    attribution:
      '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> &copy; OpenStreetMap',
  };
}

/**
 * Does the configured style actually exist, and is the key actually valid?
 *
 * This exists because of a real failure: the style id was wrong, every tile
 * 404'd, the browser quietly fell back to CARTO, and the admin panel went on
 * saying "Maps: MapTiler" — the one screen built to catch this pointed away from
 * it. A key being present is not the same as a map being drawn, and only the
 * provider can tell us which we have.
 *
 * ## Reading MapTiler's answers, which are not all what they look like
 *
 * Checked against the live account rather than assumed:
 *
 * | Response | Means | What we do |
 * |---|---|---|
 * | 200 | the style exists and the key is good | use MapTiler |
 * | 404 | **no such style** — this was the bug | fall back, and say so |
 * | 403 + "Invalid key" | the key is wrong | fall back, and say so |
 * | 403, anything else | an origin restriction refusing *our server* | **use MapTiler** |
 * | network error | our server, not their service | **use MapTiler** |
 *
 * The last two rows are the important ones. Our server sends no `Referer`, so a
 * correctly origin-restricted key can refuse us while serving the browser
 * perfectly — treating that as failure would break the setup the owner was
 * told to build, which is exactly the mistake the Google work already made once.
 * When we are unsure, we stay on MapTiler and let `BaseTiles` fall back on real
 * tile errors, because it is the browser that knows.
 */
export type MapTilerCheck =
  | { ok: true; note?: string }
  | { ok: false; reason: string };

/** A rejection stays a rejection until somebody changes something. */
const RECHECK_AFTER_FAILURE_MS = 5 * 60 * 1000;

let checked: { style: string; key: string; at: number; result: MapTilerCheck } | null = null;

/** Backs the admin "Re-check" button — see `clearTileFailureMemo`. */
export function clearMaptilerCheck(): void {
  checked = null;
}

export async function checkMaptilerStyle(): Promise<MapTilerCheck> {
  const key = maptilerKey();
  if (!key) return { ok: false, reason: "No MAPTILER_KEY is configured." };

  const style = maptilerStyle();
  const now = Date.now();
  if (checked && checked.style === style && checked.key === key) {
    // A success is good until the process restarts; a failure is re-tried
    // shortly, so a corrected variable is not disbelieved for an hour.
    if (checked.result.ok || now - checked.at < RECHECK_AFTER_FAILURE_MS) {
      return checked.result;
    }
  }

  const result = await fetchStyleCheck(style, key);
  checked = { style, key, at: now, result };
  return result;
}

/**
 * Our own site, sent as the `Referer` on the check.
 *
 * Not a trick: this request **is** made by urbannighlift.com, on behalf of the
 * page that is about to draw the tiles. Saying so is accurate.
 *
 * It is also necessary. An origin-restricted key — the setup we tell the owner
 * to build — answers **403 to everything** without one, including `style.json`,
 * so a wrong style id and a right one look identical and the check learns
 * nothing. Verified against the live key: with this header, `streets-v2-dark`
 * returns 200 and `dark-matter` returns 404. Without it, both return 403.
 */
const SITE_REFERER = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://urbannighlift.com").replace(/\/+$/, "")}/`;

async function fetchStyleCheck(style: string, key: string): Promise<MapTilerCheck> {
  const url = `https://api.maptiler.com/maps/${encodeURIComponent(style)}/style.json?key=${encodeURIComponent(key)}`;

  try {
    // One small JSON document, not a tile — cheap enough to do on a cold start
    // and it is the only thing that can answer the question.
    const res = await fetch(url, {
      headers: { Referer: SITE_REFERER },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) return { ok: true };

    const body = (await res.text().catch(() => "")).slice(0, 200);

    if (res.status === 404) {
      return {
        ok: false,
        reason:
          `MapTiler has no style called "${style}", so every tile fails and the map ` +
          `falls back to OpenStreetMap. Valid ids include streets-v2-dark, ` +
          `basic-v2-dark, dataviz-dark, toner-v2 and backdrop — set one in MAPTILER_STYLE.`,
      };
    }

    if (res.status === 403 && /invalid key/i.test(body)) {
      return { ok: false, reason: "MapTiler rejected the key in MAPTILER_KEY as invalid." };
    }

    if (res.status === 403) {
      // Almost certainly the origin restriction doing its job. The browser sends
      // a Referer; we do not.
      return {
        ok: true,
        note: "MapTiler refused our server (no Referer), which is what an origin-restricted key should do. Browsers are unaffected.",
      };
    }

    return {
      ok: true,
      note: `MapTiler answered HTTP ${res.status} when we checked the style. Tiles may still be fine — the browser check below is the one that counts.`,
    };
  } catch {
    // Our network, not their service. Falling back to CARTO over one failed
    // request from a serverless instance would be the wrong trade.
    return {
      ok: true,
      note: "Couldn't reach MapTiler from the server to verify the style. Tiles are fetched by the browser, so this may not affect anyone.",
    };
  }
}
