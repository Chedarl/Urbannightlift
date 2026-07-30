"use client";

import { TileLayer } from "react-leaflet";
import { useTiles } from "@/lib/maps/useTiles";

/**
 * The one basemap layer, used by every map in the product.
 *
 * There were five hand-written `<TileLayer>` tags with the CARTO URL pasted
 * into each — customer tracking, the location picker, the confirm map, the
 * public watch link and the admin fleet view. Changing the basemap meant
 * changing five files and hoping none was missed. Now it is one component, and
 * the choice of provider lives in `useTiles`.
 *
 * The `key` forces a clean layer when the URL changes, which happens once per
 * page load as Google's session resolves over the CARTO first paint.
 */
export function BaseTiles({ fr = false }: { fr?: boolean }) {
  const config = useTiles(fr);
  return <TileLayer key={config.url} attribution={config.attribution} url={config.url} />;
}
