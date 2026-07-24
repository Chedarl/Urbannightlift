"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const YAOUNDE: [number, number] = [3.848, 11.502];

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-100%)"><svg width="34" height="46" viewBox="0 0 30 40" fill="none"><path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="6" fill="#0a0710"/></svg></div>`,
    iconSize: [34, 46],
    iconAnchor: [17, 46],
  });
}

function ClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ point }: { point: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo(point, Math.max(map.getZoom(), 15), { duration: 0.5 });
  }, [point, map]);
  return null;
}

/** Single draggable pin for confirming a location's exact point. */
export function ConfirmMap({
  point,
  accent,
  onMove,
}: {
  point: { lat: number; lng: number } | null;
  accent: string;
  onMove: (lat: number, lng: number) => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-700" style={{ height: 260 }}>
      <MapContainer center={point ? [point.lat, point.lng] : YAOUNDE} zoom={point ? 15 : 12} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <ClickHandler onMove={onMove} />
        <Recenter point={point ? [point.lat, point.lng] : null} />
        {point && (
          <Marker
            position={[point.lat, point.lng]}
            icon={pinIcon(accent)}
            draggable
            eventHandlers={{ dragend: (e) => { const ll = e.target.getLatLng(); onMove(ll.lat, ll.lng); } }}
          />
        )}
      </MapContainer>
    </div>
  );
}
