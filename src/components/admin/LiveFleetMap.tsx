"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Tooltip, useMap } from "react-leaflet";
import { BaseTiles } from "@/components/shared/BaseTiles";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TrackingState } from "@/lib/orders/liveWatch";

/**
 * Every rider who is actually reporting a position, on one map.
 *
 * Only riders with a real fix appear. An empty map at 2 AM is honest — it means
 * nobody's phone is reporting, which is itself the thing dispatch needs to
 * know. Inventing a pin from a delivery address would make a screen that lies
 * about where a person is, and this screen exists to be trusted.
 *
 * Colour is the age of the fix, not the rider: green while it is live, amber
 * while it is going cold, red once it stopped meaning anything.
 */

/** Biyem-Assi, the hub — where the map opens when nobody is out. */
const HUB: [number, number] = [3.8398, 11.4923];

const COLOUR: Record<TrackingState, string> = {
  LIVE: "#2fae60",
  STALE: "#d4af37",
  LOST: "#e0522f",
  NEVER: "#e0522f",
};

export interface FleetPin {
  orderId: string;
  orderCode: string;
  riderName: string;
  lat: number;
  lng: number;
  tracking: TrackingState;
  fixAgeMinutes: number | null;
  focused: boolean;
}

function pinIcon(colour: string, focused: boolean) {
  const size = focused ? 22 : 16;
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%)"><div style="width:${size}px;height:${size}px;border-radius:50%;background:${colour};border:2px solid #0a0710;box-shadow:0 0 0 ${focused ? 8 : 5}px ${colour}44"></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Follows the focused rider; otherwise frames everyone who is out. */
function Frame({ pins }: { pins: FleetPin[] }) {
  const map = useMap();
  const focused = pins.find((p) => p.focused);
  useEffect(() => {
    if (focused) {
      map.setView([focused.lat, focused.lng], 16);
    } else if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 15);
    } else if (pins.length > 1) {
      map.fitBounds(pins.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [40, 40] });
    }
  }, [pins, focused, map]);
  return null;
}

export function LiveFleetMap({ riders }: { riders: FleetPin[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800">
      <MapContainer
        center={riders.length > 0 ? [riders[0].lat, riders[0].lng] : HUB}
        zoom={13}
        style={{ height: 300, width: "100%", background: "#0a0710" }}
        scrollWheelZoom={false}
      >
        <BaseTiles />
        <Frame pins={riders} />
        {riders.map((r) => (
          <Marker key={r.orderId} position={[r.lat, r.lng]} icon={pinIcon(COLOUR[r.tracking], r.focused)}>
            <Tooltip direction="top" offset={[0, -10]}>
              <span className="text-xs">
                {r.riderName} · {r.orderCode}
                {r.fixAgeMinutes != null && r.fixAgeMinutes > 0 && ` · ${r.fixAgeMinutes}m ago`}
              </span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      {riders.length === 0 && (
        <p className="border-t border-ink-800 bg-ink-900 px-3 py-2 text-xs text-mist-500">
          Nobody is reporting a position right now. A rider only appears here while their phone is awake and
          sharing — a web page cannot track a phone with the screen off.
        </p>
      )}
    </div>
  );
}
