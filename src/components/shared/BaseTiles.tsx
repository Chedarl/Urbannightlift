"use client";

import { useRef, useState } from "react";
import { TileLayer } from "react-leaflet";
import { useTiles, CARTO } from "@/lib/maps/useTiles";

/**
 * The one basemap layer, used by every map in the product.
 *
 * There were five hand-written `<TileLayer>` tags with the CARTO URL pasted
 * into each — customer tracking, the location picker, the confirm map, the
 * public watch link and the admin fleet view. Changing the basemap meant
 * changing five files and hoping none was missed. Now it is one component, and
 * the choice of provider lives in `useTiles`.
 */

/**
 * Enough failures to be sure it is the key and not one bad tile.
 *
 * Leaflet fires `tileerror` for ordinary transient misses too, so reacting to
 * the first one would drop a working Google map on a single dropped request.
 */
const FAILURES_BEFORE_FALLBACK = 4;

export function BaseTiles({ fr = false }: { fr?: boolean }) {
  const config = useTiles(fr);
  const [rejected, setRejected] = useState(false);
  const failures = useRef(0);

  // The server can hand us a working config and the browser still be refused —
  // a key restricted to the wrong origin, or to the wrong API, fails only at
  // this point. Left alone that renders an *empty grid*, which is worse than
  // OpenStreetMap because the map looks broken rather than plain. So the client
  // makes its own last call and falls back too.
  const active = rejected ? CARTO : config;

  return (
    <TileLayer
      key={active.url}
      attribution={active.attribution}
      url={active.url}
      eventHandlers={{
        tileerror: () => {
          // CARTO is already the floor; there is nothing to fall back to.
          if (rejected || config.provider === "carto") return;
          failures.current += 1;
          if (failures.current >= FAILURES_BEFORE_FALLBACK) setRejected(true);
        },
        tileload: () => {
          // A tile that loads clears the count: intermittent misses on a bad
          // connection must not accumulate over a whole session into a fallback.
          failures.current = 0;
        },
      }}
    />
  );
}
