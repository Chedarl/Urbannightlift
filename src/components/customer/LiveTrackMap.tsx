"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, ExternalLink } from "lucide-react";
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
  const { t, locale } = useTranslation();
  const [pickup, setPickup] = useState<Pt | null>(null);
  const [delivery, setDelivery] = useState<Pt | null>(null);
  const [rider, setRider] = useState<Pt | null>(null);
  const [riderAt, setRiderAt] = useState<string | null>(null);
  // re-render every 15s so the "updated N ago" label stays fresh
  const [, setTick] = useState(0);

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
        setRiderAt(d.rider?.at ?? null);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 7000);
    const tickId = setInterval(() => setTick((n) => n + 1), 15000);
    return () => { live = false; clearInterval(id); clearInterval(tickId); };
  }, [orderCode]);

  const pts = [pickup, delivery, rider].filter(Boolean) as Pt[];
  const hasCoords = pts.length > 0;

  // Relative "updated N ago" for the rider's last fix, plus a staleness flag.
  const ageMs = riderAt ? Date.now() - new Date(riderAt).getTime() : null;
  const isStale = ageMs != null && ageMs > 120_000; // > 2 min
  const agoLabel = (() => {
    if (ageMs == null) return "";
    const sec = Math.max(0, Math.round(ageMs / 1000));
    if (sec < 10) return t("track.justNow");
    if (sec < 60) return t("track.secondsShort").replace("{n}", String(sec));
    return t("track.minutesShort").replace("{n}", String(Math.round(sec / 60)));
  })();

  // Prefer the rider's live point for the maps link; fall back to delivery/pickup.
  const focus = rider ?? delivery ?? pickup;
  const mapsHref = focus ? `https://www.google.com/maps/search/?api=1&query=${focus.lat},${focus.lng}` : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="text-xs font-semibold text-mist-300">{t("track.mapTitle")}</p>
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200"
          >
            <ExternalLink className="h-3 w-3" /> {t("track.openInMaps")}
          </a>
        )}
      </div>

      {hasCoords ? (
        <div style={{ height: 240 }}>
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
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 pb-3 pt-1 text-xs leading-relaxed text-mist-400">
          <Navigation className="h-4 w-4 shrink-0 text-mist-500" />
          <span>{t("track.waitingRider")}</span>
        </div>
      )}

      <p
        className={`px-3 py-1.5 text-center text-[11px] ${
          rider ? (isStale ? "bg-ink-950 text-mist-500" : "bg-ink-950 text-safe") : "bg-ink-950 text-mist-500"
        }`}
      >
        {rider
          ? isStale
            ? t("track.stale").replace("{time}", agoLabel)
            : `${t("track.riderLive")}${agoLabel ? ` · ${t("track.updatedAgo").replace("{time}", agoLabel)}` : ""}`
          : locale === "fr"
            ? "En attente de la position du livreur"
            : "Waiting for rider location"}
      </p>
    </div>
  );
}
