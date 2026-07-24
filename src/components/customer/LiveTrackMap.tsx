"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "@/lib/i18n";

interface Pt { lat: number; lng: number }

function icon(color: string, pulse = false) {
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%)">${
      pulse
        ? `<div style="width:18px;height:18px;border-radius:50%;background:${color};box-shadow:0 0 0 6px ${color}44;"></div>`
        : `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #0a0710;"></div>`
    }</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function Fit({ points }: { points: Pt[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => p);
    if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 15);
    else if (valid.length > 1) map.fitBounds(valid.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export function LiveTrackMap({ orderCode }: { orderCode: string }) {
  const { locale } = useTranslation();
  const [pickup, setPickup] = useState<Pt | null>(null);
  const [delivery, setDelivery] = useState<Pt | null>(null);
  const [rider, setRider] = useState<Pt | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/track/${orderCode}?cb=${Date.now()}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!live) return;
        setPickup(d.pickup);
        setDelivery(d.delivery);
        setRider(d.rider);
        setOk(Boolean(d.pickup || d.delivery || d.rider));
      } catch {}
    };
    poll();
    const id = setInterval(poll, 12000);
    return () => { live = false; clearInterval(id); };
  }, [orderCode]);

  if (!ok) return null;
  const pts = [pickup, delivery, rider].filter(Boolean) as Pt[];

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700" style={{ height: 240 }}>
      <MapContainer center={[3.848, 11.502]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <Fit points={pts} />
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={icon("#d4af37")} />}
        {delivery && <Marker position={[delivery.lat, delivery.lng]} icon={icon("#9645de")} />}
        {rider && <Marker position={[rider.lat, rider.lng]} icon={icon("#2fae60", true)} />}
        {pickup && delivery && (
          <Polyline positions={[[pickup.lat, pickup.lng], [delivery.lat, delivery.lng]]} pathOptions={{ color: "#7b2cbf", dashArray: "6 8", weight: 2 }} />
        )}
      </MapContainer>
      {rider && (
        <p className="bg-ink-950 px-3 py-1.5 text-center text-[11px] text-safe">
          {locale === "fr" ? "Position du livreur en direct" : "Rider location · live"}
        </p>
      )}
    </div>
  );
}
