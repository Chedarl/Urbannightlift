"use client";

import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";

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
 * different from what customers are seeing.
 */
export function MapsStatus() {
  const [state, setState] = useState<{ google: boolean; reason?: string } | null>(null);

  useEffect(() => {
    fetch("/api/maps/tile-session")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState(null));
  }, []);

  if (!state) return null;

  return (
    <div
      className={`rounded-xl border p-3 ${
        state.google ? "border-safe/40 bg-safe/5" : "border-caution/40 bg-caution/5"
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MapIcon className={`h-4 w-4 ${state.google ? "text-safe" : "text-caution"}`} />
        <span className={state.google ? "text-safe" : "text-caution"}>
          Maps: {state.google ? "Google" : "OpenStreetMap"}
        </span>
      </p>

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
            far less of Yaoundé. The most common cause is an HTTP-referrer
            restriction on the key: the tile session is created by our server,
            which sends no referrer, so Google refuses it. See
            docs/GOOGLE-MAPS-SETUP.md.
          </p>
        </>
      )}
    </div>
  );
}
