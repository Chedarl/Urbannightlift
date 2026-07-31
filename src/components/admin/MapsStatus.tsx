"use client";

import { useCallback, useEffect, useState } from "react";
import { Map as MapIcon, RefreshCw } from "lucide-react";

/**
 * One line telling the owner which basemap the site is actually drawing, and
 * why.
 *
 * Before this, four different problems — no key, a key restricted by HTTP
 * referrer, billing not enabled, the Map Tiles API not enabled — all produced
 * the identical silent fallback to OpenStreetMap. There was no way to tell them
 * apart from the outside, and each needs a completely different fix. This turns
 * that into a glance.
 *
 * It reads the same endpoint every map reads, so it cannot report something
 * different from what customers are seeing — but it reads it **uncached**. The
 * public response is held by the CDN for a few minutes, which is right for
 * customers and wrong for the person who has just changed a key and is standing
 * here waiting to find out whether it worked.
 */
export function MapsStatus() {
  const [state, setState] = useState<{ google: boolean; reason?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (retry: boolean) => {
    setChecking(true);
    try {
      const res = await fetch(
        `/api/maps/tile-session?${retry ? "retry=1&" : ""}t=${Date.now()}`,
        { cache: "no-store" }
      );
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

  if (!state) return null;

  return (
    <div
      className={`rounded-xl border p-3 ${
        state.google ? "border-safe/40 bg-safe/5" : "border-caution/40 bg-caution/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapIcon className={`h-4 w-4 ${state.google ? "text-safe" : "text-caution"}`} />
          <span className={state.google ? "text-safe" : "text-caution"}>
            Maps: {state.google ? "Google" : "OpenStreetMap"}
          </span>
        </p>
        {/* Forces a real retry rather than the remembered rejection. Without it,
            somebody who just enabled billing waits five minutes to learn whether
            it worked — long enough to assume it didn't and undo it. */}
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

      {state.google ? (
        <p className="mt-1 text-xs text-mist-500">
          Google tiles and address search are live.
        </p>
      ) : (
        <>
          {/* Google's own words. They are what distinguish a referrer
              restriction from billing being off, and the fix differs entirely. */}
          <p className="mt-1 text-xs leading-relaxed text-mist-300">
            {state.reason ?? "No reason reported."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-mist-500">
            Maps still work — this is the free OpenStreetMap basemap, which knows
            far less of Yaoundé. The two most common causes are billing not being
            enabled on the Google Cloud project, and an HTTP-referrer restriction
            on the key: the tile session is created by our server, which sends no
            referrer, so Google refuses it. See docs/GOOGLE-MAPS-SETUP.md.
          </p>
        </>
      )}
    </div>
  );
}
