"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Map as MapIcon, RefreshCw } from "lucide-react";

/**
 * Which basemap the site is actually drawing, and why it is not the one you
 * configured.
 *
 * Several different problems — no key, a key restricted the wrong way, billing
 * not enabled, a style id that does not exist — all produced the identical
 * silent fallback. There was no way to tell them apart from the outside, and
 * each needs a completely different fix. This turns that into a glance.
 *
 * ## Why it loads a tile instead of trusting the answer
 *
 * The first version of this panel reported the **server's choice** and stopped
 * there. It said "Maps: MapTiler" for a day while every customer saw
 * OpenStreetMap, because the style id was wrong, the tiles 404'd, and
 * `BaseTiles` fell back in the browser exactly as designed. Both halves were
 * telling the truth about different things, and the screen built to catch this
 * pointed away from it.
 *
 * So it does the only thing a server cannot: it is already running in a browser
 * on the admin's own device, with the same origin and the same `Referer` a
 * customer sends, so it fetches one real tile and reports whether it painted.
 * When the server's choice and the browser's reality disagree, that
 * disagreement is the single most useful thing on this screen.
 */

type Provider = "maptiler" | "google" | "carto";

const LABEL: Record<Provider, string> = {
  maptiler: "MapTiler",
  google: "Google",
  carto: "OpenStreetMap",
};

/**
 * A tile covering Yaoundé at zoom 12 — the city this all exists for, so a
 * provider that has no coverage here fails the check rather than passing it on
 * an ocean tile. From the standard slippy-map formula at 3.848 N, 11.502 E.
 */
const PROBE = { z: 12, x: 2178, y: 2004 };

/** Long enough for a bad night on mobile data, short enough to not look hung. */
const PROBE_TIMEOUT_MS = 10_000;

type ProbeResult = "loading" | "ok" | "failed" | "timeout";

function probeUrl(template: string): string {
  return template
    .replace("{s}", "a") // CARTO's subdomain rotation
    .replace("{r}", "") // Leaflet's retina suffix; the URL is already @2x where it matters
    .replace("{z}", String(PROBE.z))
    .replace("{x}", String(PROBE.x))
    .replace("{y}", String(PROBE.y));
}

export function MapsStatus() {
  const [state, setState] = useState<{ provider: Provider; url: string; reason?: string } | null>(
    null
  );
  const [probe, setProbe] = useState<ProbeResult>("loading");
  const [checking, setChecking] = useState(false);
  const probeRef = useRef<HTMLImageElement | null>(null);

  const check = useCallback(async (retry: boolean) => {
    setChecking(true);
    setProbe("loading");
    try {
      // Uncached on purpose. The public response is held briefly by the CDN,
      // which is right for customers and wrong for the person who has just
      // changed a key and is standing here waiting to find out whether it took.
      const res = await fetch(`/api/maps/tile-session?${retry ? "retry=1&" : ""}t=${Date.now()}`, {
        cache: "no-store",
      });
      setState(await res.json());
    } catch {
      setState(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check(false);
  }, [check]);

  // The browser half. Deliberately a plain <img> rather than fetch(): it is
  // exactly what Leaflet does, so it is subject to the same origin restriction
  // and the same cache, and a CORS rule can never make it disagree with the map.
  useEffect(() => {
    if (!state?.url) return;

    let settled = false;
    const img = new Image();
    probeRef.current = img;

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      setProbe(result);
    };

    const timer = setTimeout(() => finish("timeout"), PROBE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      finish("ok");
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish("failed");
    };
    img.src = probeUrl(state.url);

    return () => {
      clearTimeout(timer);
      settled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [state]);

  if (!state) return null;

  // CARTO is the floor. It works and always has, but it is the plainest of the
  // three and means a key somewhere is not doing its job.
  const onFallback = state.provider === "carto";
  // The case this panel exists for: the server picked a provider and this
  // browser cannot draw it, so customers are on something else entirely.
  const disagrees = !onFallback && (probe === "failed" || probe === "timeout");
  const bad = onFallback || disagrees;

  return (
    <div
      className={`rounded-xl border p-3 ${
        bad ? "border-caution/40 bg-caution/5" : "border-safe/40 bg-safe/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapIcon className={`h-4 w-4 ${bad ? "text-caution" : "text-safe"}`} />
          <span className={bad ? "text-caution" : "text-safe"}>
            Maps: {LABEL[state.provider] ?? state.provider}
          </span>
        </p>
        {/* Forces a real retry rather than the remembered rejection. Without it,
            somebody who just fixed a key waits five minutes to learn whether it
            worked — long enough to assume it didn't and undo it. */}
        <button
          type="button"
          onClick={() => check(true)}
          disabled={checking}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1 text-xs text-mist-400 hover:text-mist-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          Re-check
        </button>
      </div>

      {/* What this browser actually managed to draw, which is what a customer
          would have seen from the same place. */}
      <p className="mt-1.5 text-xs text-mist-400">
        {probe === "loading" && "Loading a real tile in this browser…"}
        {probe === "ok" && (
          <span className="text-safe">
            A real {LABEL[state.provider] ?? state.provider} tile loaded in this browser.
          </span>
        )}
        {probe === "failed" && (
          <span className="text-caution">
            This browser could not load a {LABEL[state.provider] ?? state.provider} tile
            {onFallback ? "." : " — so customers are seeing OpenStreetMap, not this."}
          </span>
        )}
        {probe === "timeout" && (
          <span className="text-caution">
            A tile did not arrive within {PROBE_TIMEOUT_MS / 1000} seconds. That may be this
            connection rather than the map.
          </span>
        )}
      </p>

      {disagrees && (
        <p className="mt-2 text-xs leading-relaxed text-mist-300">
          The server chose {LABEL[state.provider] ?? state.provider} but the tiles do not load
          here. The usual causes are a style id that does not exist, or a key restricted to an
          origin this page is not on. Open the browser console and look for 401, 403 or 404 on
          the tile request — the status says which.
        </p>
      )}

      {!onFallback ? (
        state.reason ? (
          // A note rather than a failure: the server was unsure, said so, and
          // kept the good provider. Worth showing, never worth alarming about.
          <p className="mt-2 text-xs leading-relaxed text-mist-500">{state.reason}</p>
        ) : null
      ) : (
        <>
          {/* The provider's own words. They are what distinguish a key
              restriction from billing being off, and the fixes differ entirely. */}
          <p className="mt-1 text-xs leading-relaxed text-mist-300">
            {state.reason ?? "No reason reported."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-mist-500">
            Maps still work — this is the free OpenStreetMap basemap. The quickest way onto a
            better one is MapTiler: it needs no card, no billing account and no server setup,
            just a key in <span className="font-mono text-mist-400">MAPTILER_KEY</span>. See
            docs/MAPS-SETUP.md.
          </p>
        </>
      )}
    </div>
  );
}
