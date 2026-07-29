"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * The watcher's map: one moving rider, one approximate destination.
 *
 * The destination pin is drawn as a soft circle rather than a point, because
 * it IS approximate — rounded to about a hundred metres before it ever left the
 * server. Drawing it as a sharp pin would claim a precision this page
 * deliberately does not have, and should not have.
 */

const HUB: [number, number] = [3.8398, 11.4923];

function riderIcon(stale: boolean) {
  const c = stale ? "#d4af37" : "#2fae60";
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%)"><div style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid #0a0710;box-shadow:0 0 0 7px ${c}44"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-50%)"><div style="width:46px;height:46px;border-radius:50%;background:#7c4dff22;border:1px dashed #b39dffaa"></div></div>`,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
});

function Frame({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    else if (points.length > 1)
      map.fitBounds(points.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [50, 50] });
  }, [points, map]);
  return null;
}

export function WatchMap({
  rider,
  destination,
  stale,
}: {
  rider: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  stale: boolean;
}) {
  const points = [rider, destination].filter((p): p is { lat: number; lng: number } => p != null);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800">
      <MapContainer
        center={points[0] ? [points[0].lat, points[0].lng] : HUB}
        zoom={13}
        style={{ height: 300, width: "100%", background: "#0a0710" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Frame points={points} />
        {destination && <Marker position={[destination.lat, destination.lng]} icon={destinationIcon} />}
        {rider && <Marker position={[rider.lat, rider.lng]} icon={riderIcon(stale)} />}
        {rider && destination && (
          <Polyline
            positions={[
              [rider.lat, rider.lng],
              [destination.lat, destination.lng],
            ]}
            pathOptions={{ color: "#b39dff", weight: 2, dashArray: "6 8", opacity: 0.6 }}
          />
        )}
      </MapContainer>
      {!rider && (
        <p className="border-t border-ink-800 bg-ink-900 px-3 py-2 text-[11px] text-mist-500">
          The rider has not shared a position yet. It appears here as soon as they do.
        </p>
      )}
    </div>
  );
}
