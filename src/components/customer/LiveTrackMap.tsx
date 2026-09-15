"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Circle, useMap } from "react-leaflet";
import { BaseTiles } from "@/components/shared/BaseTiles";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinOff, Navigation, ExternalLink, Clock, Phone, User } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
// The arrival time is shared with the live order strip, so both screens can
// never disagree about the same rider. See `lib/orders/eta.ts`.
import { etaMinutes, freshness } from "@/lib/orders/eta";
import { mediaSrc } from "@/lib/uploads/mediaSrc";
import { DISPATCH_TEL } from "@/lib/contact";
import { CallRiderButton } from "@/components/customer/call/CallRiderButton";


interface Pt { lat: number; lng: number }

/**
 * The courier, as this screen needs them: a face, a first name, a bike.
 *
 * The same shape `RiderIdentityCard` renders in full higher up the page. This
 * row is the *action* surface — it exists so that the person watching the dot
 * move has somewhere to press when it stops moving — and the card stays the
 * *trust* surface, where the ID check and "only give your code to Paul" live.
 * Neither is a shortened copy of the other; they answer different questions.
 */
interface Courier { fullName: string; photoUrl: string | null; vehicleRef: string | null }
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
  // Comes free with the poll below — `/api/track` already returns it, and
  // fetching a second time for a name we are handed would be silly.
  const [courier, setCourier] = useState<Courier | null>(null);
  /*
    Whether this viewer may open a voice line, asked separately.

    `/api/track` is public — any order code returns a snapshot — so it cannot
    answer a question that depends on who is asking. A call button rendered off
    that payload would appear for anybody holding a screenshot.
  */
  const [callable, setCallable] = useState(false);
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
        setCourier((d.riderIdentity as Courier | null) ?? null);
      } catch {}
    };
    /*
      Slower than the position poll on purpose. Callability turns over when a
      rider accepts or an order changes status — a few times per delivery, not
      every seven seconds — and this one runs the full authorisation check.
    */
    const askCallable = async () => {
      try {
        const r = await fetch(`/api/calls/can?orderCode=${encodeURIComponent(orderCode)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { callable?: boolean };
        if (live) setCallable(d.callable === true);
      } catch {}
    };

    poll();
    askCallable();
    const callId = setInterval(askCallable, 30_000);
    const id = setInterval(poll, 7000);
    const tickId = setInterval(() => setTick((n) => n + 1), 15000);
    return () => { live = false; clearInterval(id); clearInterval(tickId); clearInterval(callId); };
  }, [orderCode]);

  const pts = [pickup, delivery, rider].filter(Boolean) as Pt[];
  const hasCoords = pts.length > 0;

  // Relative "updated N ago" for the rider's last fix, plus a staleness flag.
  const ageMs = riderAt ? Date.now() - new Date(riderAt).getTime() : null;
  const isStale = ageMs != null && ageMs > 120_000; // > 2 min
  const fresh = freshness(ageMs);
  /**
   * The age as a bare duration — "16s", "2 min" — for the frames that want one.
   *
   * Empty for `now`, and on purpose: "just now" is a whole sentence and does
   * not go in a `{time}` slot. That substitution shipped "updated just now ago"
   * to this screen and "last sent just now ago" to every rider actively sharing
   * their location. See `freshness` in `lib/orders/eta.ts`.
   */
  const agoLabel =
    fresh.kind === "seconds"
      ? t("track.secondsShort").replace("{n}", String(fresh.n))
      : fresh.kind === "minutes"
        ? t("track.minutesShort").replace("{n}", String(fresh.n))
        : "";

  /**
   * Roughly how long until it arrives, from the straight-line distance. Stated
   * as an estimate because that is what it is — there is no routing engine
   * behind it, and pretending otherwise would be a promise we cannot keep.
   */
  const eta = etaMinutes(rider, delivery, isStale);

  // Prefer the rider's live point for the maps link; fall back to delivery/pickup.
  const focus = rider ?? delivery ?? pickup;
  const mapsHref = focus ? `https://www.google.com/maps/search/?api=1&query=${focus.lat},${focus.lng}` : null;

  /** What the strip at the bottom of the sheet says about the fix we have. */
  const liveLine = rider
    ? isStale
      ? t("track.stale").replace("{time}", agoLabel)
      : `${t("track.riderLive")}${
          fresh.kind === "now"
            ? ` · ${t("track.updatedJustNow")}`
            : agoLabel
              ? ` · ${t("track.updatedAgo").replace("{time}", agoLabel)}`
              : ""
        }`
    : locale === "fr"
      ? "En attente de la position du livreur"
      : "Waiting for rider location";

  return (
    /*
      ══ The map is the screen, not a card on it ══

      This was a 240px box with a header row above it and two notice rows below,
      sitting two thirds of the way down a six-screen scroll. So the one thing a
      customer opens this page to look at — where the bike is — was the smallest
      element on it, and everything that explained it was stacked outside it.

      Inverted: the map is the base layer at a size you can actually read a
      street from, and everything else floats over it on one glass sheet. That
      is the shape every tracking screen worth copying uses, and it is the shape
      the 2025 blueprint describes — full-bleed map, elevated status card, the
      courier row inside it.

      The sheet is the *only* thing over the map, so there is one place to look
      rather than four.
    */
    <div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
      {hasCoords ? (
        <div className="h-[26rem]">
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
        /* No coordinates yet. Still the full height, so the sheet does not jump
           up the page the moment the first fix arrives. Both heights are the
           same literal on purpose: a CSS variable here (`h-[--map-h]`) is not
           the Tailwind v4 spelling and silently produced a zero-height map. */
        <div className="flex h-[26rem] items-center justify-center px-6 text-center">
          <p className="flex flex-col items-center gap-2 text-xs leading-relaxed text-mist-400">
            <Navigation className="h-6 w-6 text-mist-600" />
            {t("track.waitingRider")}
          </p>
        </div>
      )}

      {/* ══ One sheet, floating ══ */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pt-3 pb-6">
        <div className="glass-raised pointer-events-auto rounded-lg px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-semibold text-mist-200">
              {/* The pulsing dot the reference apps use, so a customer can see at
                  a glance that the position is current rather than frozen. */}
              {rider && !isStale && (
                <span className="inline-flex items-center gap-1.5 text-safe">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safe opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-safe" />
                  </span>
                  {locale === "fr" ? "En direct" : "Live"}
                </span>
              )}
              {!rider && t("track.mapTitle")}
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

          {/* The arrival time, set as the largest thing on the sheet, because it
              is the one number this whole screen exists to produce. */}
          {eta != null && (
            <p className="mt-1 flex items-baseline gap-1.5">
              <Clock className="h-4 w-4 shrink-0 self-center text-safe" />
              <span className="font-display text-2xl font-extrabold tabular-nums text-mist-100">
                {t("track.etaMinutes").replace("{n}", String(eta))}
              </span>
            </p>
          )}

          <p className={`mt-1 text-xs ${rider && !isStale ? "text-mist-400" : "text-mist-500"}`}>
            {liveLine}
          </p>

          {/*
            ══ The courier row ══

            The one thing this screen was missing. Everything above it is
            *information* — a dot, a time, a freshness label — and when the dot
            stops moving at 1 a.m. information is not what a person wants. They
            want somebody.

            Two rules it is built to:

            **It is not a second identity card.** `RiderIdentityCard` further up
            carries the ID check, the plate and the warning about who may be
            given the delivery code. Repeating those here would be two places to
            read the same sentence and one place to forget to update it. This
            row carries a face, a first name and a way through.

            **The human rail is permanent, not a fallback.** Dispatch is on this
            row whenever a rider is assigned — never conditional on something
            else having failed first. A rail that appears only when the logic
            decides something is wrong is a rail that disappears exactly when
            that logic is the thing that is wrong. This one breaks toward being
            reachable.

            The rider's own number is deliberately not here and will not be:
            handing it out creates a channel nobody can moderate and takes the
            rider's privacy to pay for the customer's convenience. The in-app
            call — data only, neither number disclosed — is the answer to that,
            and it lands on this row beside dispatch.
          */}
          {courier && (
            <div className="mt-3 flex items-center gap-3 border-t border-ink-700/60 pt-3">
              {mediaSrc(courier.photoUrl) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={mediaSrc(courier.photoUrl)!}
                  alt={courier.fullName}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                  <User className="h-5 w-5" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-mist-100">
                  {courier.fullName.trim().split(/\s+/)[0]}
                </p>
                <p className="truncate text-xs text-mist-500">
                  {courier.vehicleRef ?? (locale === "fr" ? "Votre livreur" : "Your rider")}
                </p>
              </div>

              {/*
                The in-app call, and the human rail beside it.

                Both, never one instead of the other. The call is the better
                answer when it works — data only, neither number disclosed —
                and dispatch is the answer when it does not, which on a Yaoundé
                mobile network is roughly one connection in five. Showing only
                the first would leave those people with a button and no way
                through; showing only the second is what we had.

                `CallRiderButton` renders nothing at all when the server says
                no. A greyed-out phone icon advertises a feature, invites a tap
                and answers with nothing.
              */}
              <CallRiderButton
                orderCode={orderCode}
                riderFirstName={courier.fullName.trim().split(/\s+/)[0]}
                fr={locale === "fr"}
                callable={callable}
              />

              <a
                href={`tel:${DISPATCH_TEL}`}
                className="flex shrink-0 items-center gap-1.5 rounded-pill border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/25"
              >
                <Phone className="h-3.5 w-3.5" />
                {locale === "fr" ? "Régulation" : "Dispatch"}
              </a>
            </div>
          )}

          {/*
            Where the destination came from, when it did not come from the
            customer. This screen used to degrade in silence: no pin meant no
            marker, no route line and no arrival time, with nothing to say why.
            An estimate that is a kilometre loose has to admit it.
          */}
          {delivery?.approximate && (
            <p className="mt-2 flex items-start gap-1.5 border-t border-ink-700/60 pt-2 text-xs leading-relaxed text-mist-400">
              <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" />
              <span>
                {locale === "fr"
                  ? `Pas d'épingle pour la livraison — l'heure est estimée depuis le centre de ${delivery.from ?? "la zone"}, à environ un kilomètre près.`
                  : `No pin was dropped for the drop-off — this is estimated from the centre of ${delivery.from ?? "the zone"}, so it is good to about a kilometre.`}
              </span>
            </p>
          )}

          {rider && !delivery && (
            <p className="mt-2 flex items-start gap-1.5 border-t border-ink-700/60 pt-2 text-xs leading-relaxed text-mist-400">
              <MapPinOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" />
              <span>
                {locale === "fr"
                  ? "Nous n'avons pas de point de livraison sur la carte, donc pas d'heure d'arrivée. Votre livreur connaît l'adresse."
                  : "We have no drop-off point on the map, so there is no arrival time. Your rider has the address."}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
