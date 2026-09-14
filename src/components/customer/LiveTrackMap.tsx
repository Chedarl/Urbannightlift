"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Circle, useMap } from "react-leaflet";
import { BaseTiles } from "@/components/shared/BaseTiles";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinOff, Navigation, ExternalLink, Clock } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { distanceKm } from "@/lib/orders/pricing";

/**
 * Average night speed for a motorbike in Yaoundé. The roads are empty after
 * midnight but the surfaces are not, so this is well below a daytime figure —
 * an ETA that keeps passing without the rider arriving is worse than no ETA.
 */
const NIGHT_SPEED_KMH = 18;
/** Finding the door, parking, the stairs. Deliveries are never door-to-door. */
const HANDOVER_MINUTES = 4;

interface Pt { lat: number; lng: number }
/**
 * A destination is either the customer's own pin or, when the address never
 * geocoded, the centre of their drop-off zone.
 *
 * Most people here type a landmark rather than dropping a pin, and the
 * geocoder does not always find it. When it failed, this screen used to lose
 * the destination marker, the route line **and the arrival time** — the ETA is
 * computed rider-to-destination and was suppressed outright — with nothing
 * saying why. A rider would hear "the tracking does not work" and be right.
 *
 * A zone centre is about a kilometre out. Useless for the last hundred metres,
 * perfectly good for "how far away is he", so it is used and labelled rather
 * than dropped.
 */
interface Destination extends Pt { approximate: boolean; from: string | null }

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
  const [delivery, setDelivery] = useState<Destination | null>(null);
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

  /**
   * Roughly how long until it arrives, from the straight-line distance. Stated
   * as an estimate because that is what it is — there is no routing engine
   * behind it, and pretending otherwise would be a promise we cannot keep.
   */
  const etaMinutes = (() => {
    if (!rider || !delivery || isStale) return null;
    const km = distanceKm(rider.lat, rider.lng, delivery.lat, delivery.lng);
    if (!Number.isFinite(km)) return null;
    // Straight-line under-reads real roads; a little padding is honest.
    const minutes = Math.round((km / NIGHT_SPEED_KMH) * 60 * 1.3) + HANDOVER_MINUTES;
    return Math.max(2, Math.min(90, minutes));
  })();

  // Prefer the rider's live point for the maps link; fall back to delivery/pickup.
  const focus = rider ?? delivery ?? pickup;
  const mapsHref = focus ? `https://www.google.com/maps/search/?api=1&query=${focus.lat},${focus.lng}` : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-mist-300">
          {t("track.mapTitle")}
          {/* A legible "live" state — the pulsing dot the reference apps use so
              you can see at a glance that the position is current, not frozen. */}
          {rider && !isStale && (
            <span className="inline-flex items-center gap-1 rounded-full bg-safe/15 px-2 py-0.5 text-xs font-semibold text-safe">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safe/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-safe" />
              </span>
              {locale === "fr" ? "En direct" : "Live"}
            </span>
          )}
          {etaMinutes != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-safe/15 px-2 py-0.5 text-xs font-semibold text-safe">
              <Clock className="h-3 w-3" />
              {t("track.etaMinutes").replace("{n}", String(etaMinutes))}
            </span>
          )}
        </p>
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
          >
            <ExternalLink className="h-3 w-3" /> {t("track.openInMaps")}
          </a>
        )}
      </div>

      {hasCoords ? (
        <div style={{ height: 240 }}>
          <MapContainer center={[3.848, 11.502]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
            <BaseTiles />
            <Fit points={pts} />
            {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={icon("#d4af37")} />}
            {/* Solid where the customer pinned it; hollow where we are guessing from the
                zone. Drawing an approximation as though it were exact is how
                somebody ends up at the wrong gate. */}
            {delivery && (
              delivery.approximate
                ? <Circle center={[delivery.lat, delivery.lng]} radius={700}
                    pathOptions={{ color: "#9645de", weight: 1.5, dashArray: "5 6", fillColor: "#9645de", fillOpacity: 0.08 }} />
                : <Marker position={[delivery.lat, delivery.lng]} icon={icon("#9645de")} />
            )}
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

      {/*
        Where the destination came from, when it did not come from the customer.

        This screen used to degrade in silence: no pin meant no destination
        marker, no route line and no arrival time, with nothing to say why. The
        estimate is now made from the zone centre instead, and a reading that is
        about a kilometre loose has to say so — an arrival time presented as
        exact when it is not is worse than no arrival time at all.
      */}
      {delivery?.approximate && (
        <p className="flex items-start gap-1.5 border-t border-ink-700 px-3 py-2 text-xs leading-relaxed text-mist-400">
          <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" />
          <span>
            {locale === "fr"
              ? `Pas d'épingle pour la livraison — l'heure est estimée depuis le centre de ${delivery.from ?? "la zone"}, à environ un kilomètre près.`
              : `No pin was dropped for the drop-off — this is estimated from the centre of ${delivery.from ?? "the zone"}, so it is good to about a kilometre.`}
          </span>
        </p>
      )}

      {/* And when there is no destination at all, say that rather than simply
          showing a rider moving with no context. */}
      {rider && !delivery && (
        <p className="flex items-start gap-1.5 border-t border-ink-700 px-3 py-2 text-xs leading-relaxed text-mist-400">
          <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" />
          <span>
            {locale === "fr"
              ? "Nous n'avons pas de point de livraison sur la carte, donc pas d'heure d'arrivée. Votre livreur connaît l'adresse."
              : "We have no drop-off point on the map, so there is no arrival time. Your rider has the address."}
          </span>
        </p>
      )}

      <p
        className={`px-3 py-1.5 text-center text-xs ${
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
