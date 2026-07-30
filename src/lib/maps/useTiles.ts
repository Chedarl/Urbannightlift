"use client";

import { useEffect, useState } from "react";

/**
 * The basemap every Leaflet map on the site draws.
 *
 * Starts on CARTO and upgrades to Google when the session resolves, so a map
 * paints immediately rather than waiting on a network round trip — the first
 * frame of a tracking screen is the one that matters most.
 *
 * Module-cached: five map components across the customer, rider and admin apps
 * share one answer per page load. A failure is silent and permanent for that
 * load; the CARTO tiles are a real map, not an error state.
 */

export interface TileConfig {
  url: string;
  attribution: string;
  google: boolean;
}

export const CARTO: TileConfig = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  google: false,
};

let cached: TileConfig | null = null;
let inFlight: Promise<TileConfig> | null = null;

function load(fr: boolean): Promise<TileConfig> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= fetch(`/api/maps/tile-session?lang=${fr ? "fr" : "en"}`)
    .then((r) => (r.ok ? r.json() : CARTO))
    .then((c: TileConfig) => {
      cached = c?.url ? c : CARTO;
      return cached;
    })
    .catch(() => CARTO)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useTiles(fr = false): TileConfig {
  const [config, setConfig] = useState<TileConfig>(cached ?? CARTO);

  useEffect(() => {
    if (cached) {
      setConfig(cached);
      return;
    }
    let live = true;
    load(fr).then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, [fr]);

  return config;
}
