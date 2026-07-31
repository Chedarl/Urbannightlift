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
 * `dark-matter` is MapTiler's hosted dark style and the closest ready-made
 * match to the ink/violet/gold system — near-black ground, legible roads, muted
 * labels. A bespoke style built in MapTiler Cloud can be dropped in later by
 * setting `MAPTILER_STYLE` to its id; nothing else has to change, which is the
 * point of keeping it configurable rather than hardcoded.
 */
const DEFAULT_STYLE = "dark-matter";

export function maptilerKey(): string | null {
  return process.env.MAPTILER_KEY || null;
}

export interface MapTilerConfig {
  url: string;
  attribution: string;
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

  const style = process.env.MAPTILER_STYLE || DEFAULT_STYLE;

  return {
    url: `https://api.maptiler.com/maps/${encodeURIComponent(style)}/{z}/{x}/{y}@2x.png?key=${encodeURIComponent(key)}`,
    // Required by MapTiler's terms, and the OpenStreetMap credit under it is
    // required by ODbL. Both must stay visible.
    attribution:
      '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> &copy; OpenStreetMap',
  };
}
