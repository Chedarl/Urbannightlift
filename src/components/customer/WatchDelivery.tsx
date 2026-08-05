"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Shield, Clock, Radio, Check, MoonStar } from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { useTranslation } from "@/lib/i18n";

const WatchMap = dynamic(() => import("@/components/customer/WatchMap").then((m) => m.WatchMap), { ssr: false });

/**
 * What somebody you trust sees while they watch you get home.
 *
 * This page is written for the friend, not the customer: they did not order
 * anything, they cannot do anything about it, and the only question they have
 * is "is she nearly home?". So it answers that and stops — one line of status,
 * one ETA, one moving dot, and a clear ending when the goods are in hand.
 *
 * It is also written assuming it will be forwarded, because a link whose whole
 * purpose is to be shared will be. There is nothing on it worth stealing: no
 * delivery code, no phone number, no street address, no name, no price. The
 * destination is deliberately rounded to about a hundred metres — enough to
 * watch the rider converge, not enough to publish where somebody lives.
 *
 * Every line of it was English until now, which made it the worst instance of a
 * problem the dictionary could not explain: 565 keys, complete on both sides,
 * and a page that never asked it for anything. In a city that reads French this
 * is the page a customer hands to somebody worried about them.
 */

interface Watch {
  ok: boolean;
  over?: boolean;
  arrived?: boolean;
  statusKey?: string;
  riderFirstName?: string | null;
  vehicleRef?: string | null;
  rider?: { lat: number; lng: number; at: string | null } | null;
  destination?: { lat: number; lng: number } | null;
  etaMinutes?: number | null;
  expiresAt?: string;
  reason?: string;
}

const POLL_MS = 10_000;

const STATUS_LINE: Record<string, { en: string; fr: string }> = {
  received: { en: "Their order has been received.", fr: "Leur commande a été reçue." },
  confirmed: { en: "Their order is confirmed.", fr: "Leur commande est confirmée." },
  pickup: { en: "The rider is collecting the order.", fr: "Le livreur récupère la commande." },
  onTheWay: { en: "The rider is on the way to them.", fr: "Le livreur est en route vers eux." },
  delivered: { en: "Delivered.", fr: "Livré." },
  cancelled: { en: "This delivery was stopped.", fr: "Cette livraison a été arrêtée." },
};

export function WatchDelivery({ token }: { token: string }) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [data, setData] = useState<Watch | null>(null);
  const [dead, setDead] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/watch/${token}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) {
          setDead(true);
          return;
        }
        setData(await res.json());
      } catch {
        // Keep the last reading rather than blanking a page somebody is
        // watching because they are worried.
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    // Keeps "updated N minutes ago" honest between polls.
    const ticker = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(ticker);
    };
  }, [token]);

  if (dead) {
    return (
      <Frame fr={fr}>
        <p className="text-sm text-mist-300">
          {fr
            ? "Ce lien a expiré. Les liens de suivi cessent de fonctionner une heure après la fin de la livraison, pour qu'ils ne puissent pas continuer à suivre quelqu'un une fois la nuit terminée."
            : "This link has expired. Watch links stop working an hour after the delivery finishes, so they cannot keep following somebody around after the night is over."}
        </p>
      </Frame>
    );
  }

  if (!data) {
    return (
      <Frame fr={fr}>
        <p className="text-sm text-mist-400">{fr ? "Chargement…" : "Loading…"}</p>
      </Frame>
    );
  }

  if (data.over) {
    return (
      <Frame fr={fr}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-safe/15">
            <Check className="h-7 w-7 text-safe" />
          </span>
          <h1 className="font-display text-xl font-bold text-mist-100">
            {data.arrived
              ? fr
                ? "Ils ont reçu leur livraison."
                : "They got their delivery."
              : fr
                ? "Cette livraison est terminée."
                : "This delivery is over."}
          </h1>
          <p className="text-sm text-mist-400">
            {data.arrived
              ? fr
                ? "Ils ont les articles en main. Vous pouvez arrêter de suivre."
                : "The goods are in their hands. You can stop watching."
              : fr
                ? "Il n'y a plus rien à suivre ici."
                : "Nothing more to follow here."}
          </p>
        </div>
      </Frame>
    );
  }

  const fixAge = data.rider?.at ? Math.floor((Date.now() - new Date(data.rider.at).getTime()) / 60_000) : null;
  const stale = fixAge != null && fixAge >= 3;

  const line = STATUS_LINE[data.statusKey ?? ""];

  return (
    <Frame fr={fr}>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-mist-100">
            {data.riderFirstName
              ? fr
                ? `${data.riderFirstName} apporte leur livraison.`
                : `${data.riderFirstName} is bringing their delivery.`
              : fr
                ? "Leur livraison est en route."
                : "Their delivery is on its way."}
          </h1>
          <p className="mt-1 text-sm text-mist-400">
            {line
              ? fr
                ? line.fr
                : line.en
              : fr
                ? "Suivi de leur livraison."
                : "Following their delivery."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.etaMinutes != null && (
            <Chip icon={<Clock className="h-3.5 w-3.5" />} tone="gold">
              {fr ? `À environ ${data.etaMinutes} min` : `About ${data.etaMinutes} min away`}
            </Chip>
          )}
          <Chip icon={<Radio className="h-3.5 w-3.5" />} tone={stale ? "muted" : "safe"}>
            {data.rider
              ? fixAge && fixAge > 0
                ? fr
                  ? `Position il y a ${fixAge} min`
                  : `Position ${fixAge} min ago`
                : fr
                  ? "Position en direct"
                  : "Position live"
              : fr
                ? "En attente de leur position"
                : "Waiting for their position"}
          </Chip>
          {data.vehicleRef && <Chip tone="muted">{data.vehicleRef}</Chip>}
        </div>

        <WatchMap rider={data.rider ?? null} destination={data.destination ?? null} stale={stale} />

        <p className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 text-xs leading-relaxed text-mist-400">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <span>
            {fr
              ? "Vous suivez une livraison, pas les informations d'une personne. Cette page n'affiche jamais leur nom, leur numéro, leur adresse ni leur code de livraison — la destination est volontairement approximative. Elle cesse de fonctionner une heure après la fin de la livraison."
              : "You are watching a delivery, not a person's details. This page never shows their name, their phone number, their address or their delivery code — the destination is deliberately approximate. It stops working an hour after the delivery finishes."}
          </span>
        </p>
      </div>
    </Frame>
  );
}

function Frame({ children, fr }: { children: React.ReactNode; fr: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
          <MoonStar className="h-3.5 w-3.5" /> {fr ? "Veille de nuit" : "Night watch"}
        </span>
      </div>
      {children}
      <p className="mt-auto pt-6 text-center text-[11px] text-mist-600">
        {fr ? "Urban Night Lift · Yaoundé · 18h – 4h" : "Urban Night Lift · Yaoundé · 6 PM – 4 AM"}
      </p>
    </main>
  );
}

function Chip({
  icon,
  tone,
  children,
}: {
  icon?: React.ReactNode;
  tone: "gold" | "safe" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "gold"
      ? "border-gold-400/40 bg-gold-400/10 text-gold-300"
      : tone === "safe"
        ? "border-safe/40 bg-safe/10 text-safe"
        : "border-ink-700 bg-ink-900 text-mist-400";
  return (
    <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {icon}
      {children}
    </span>
  );
}
