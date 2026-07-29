"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Shield, Clock, Radio, Check, MoonStar } from "lucide-react";
import { Logo } from "@/components/shared/Logo";

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

const STATUS_LINE: Record<string, string> = {
  received: "Their order has been received.",
  confirmed: "Their order is confirmed.",
  pickup: "The rider is collecting the order.",
  onTheWay: "The rider is on the way to them.",
  delivered: "Delivered.",
  cancelled: "This delivery was stopped.",
};

export function WatchDelivery({ token }: { token: string }) {
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
      <Frame>
        <p className="text-sm text-mist-300">
          This link has expired. Watch links stop working an hour after the delivery finishes, so they cannot keep
          following somebody around after the night is over.
        </p>
      </Frame>
    );
  }

  if (!data) {
    return (
      <Frame>
        <p className="text-sm text-mist-400">Loading…</p>
      </Frame>
    );
  }

  if (data.over) {
    return (
      <Frame>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-safe/15">
            <Check className="h-7 w-7 text-safe" />
          </span>
          <h1 className="font-display text-xl font-bold text-mist-100">
            {data.arrived ? "They got their delivery." : "This delivery is over."}
          </h1>
          <p className="text-sm text-mist-400">
            {data.arrived
              ? "The goods are in their hands. You can stop watching."
              : "Nothing more to follow here."}
          </p>
        </div>
      </Frame>
    );
  }

  const fixAge = data.rider?.at ? Math.floor((Date.now() - new Date(data.rider.at).getTime()) / 60_000) : null;
  const stale = fixAge != null && fixAge >= 3;

  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-mist-100">
            {data.riderFirstName ? `${data.riderFirstName} is bringing their delivery.` : "Their delivery is on its way."}
          </h1>
          <p className="mt-1 text-sm text-mist-400">
            {STATUS_LINE[data.statusKey ?? ""] ?? "Following their delivery."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.etaMinutes != null && (
            <Chip icon={<Clock className="h-3.5 w-3.5" />} tone="gold">
              About {data.etaMinutes} min away
            </Chip>
          )}
          <Chip icon={<Radio className="h-3.5 w-3.5" />} tone={stale ? "muted" : "safe"}>
            {data.rider
              ? fixAge && fixAge > 0
                ? `Position ${fixAge} min ago`
                : "Position live"
              : "Waiting for their position"}
          </Chip>
          {data.vehicleRef && <Chip tone="muted">{data.vehicleRef}</Chip>}
        </div>

        <WatchMap rider={data.rider ?? null} destination={data.destination ?? null} stale={stale} />

        <p className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 text-xs leading-relaxed text-mist-400">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <span>
            You are watching a delivery, not a person&apos;s details. This page never shows their name, their phone
            number, their address or their delivery code — the destination is deliberately approximate. It stops
            working an hour after the delivery finishes.
          </span>
        </p>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300">
          <MoonStar className="h-3.5 w-3.5" /> Night watch
        </span>
      </div>
      {children}
      <p className="mt-auto pt-6 text-center text-[11px] text-mist-600">
        Urban Night Lift · Yaoundé · 6 PM – 4 AM
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
