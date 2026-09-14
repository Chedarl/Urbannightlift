"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Bike, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { mediaSrc } from "@/lib/uploads/mediaSrc";

/**
 * Who is coming, before they knock.
 *
 * This is the night-safety promise made concrete: at 1 AM the difference
 * between a stranger at the gate and a named, photographed, ID-checked rider on
 * a bike you can already see described is the whole product. It shows the
 * moment a rider is assigned rather than waiting for their GPS to come alive.
 *
 * Deliberately absent: the rider's phone number and anything from their ID
 * card. Handing out a rider's personal number creates a channel we cannot
 * moderate, and the ID never leaves staff.
 */

interface Identity {
  fullName: string;
  photoUrl: string | null;
  vehicleRef: string | null;
  idVerified: boolean;
}

export function RiderIdentityCard({ orderCode, fr }: { orderCode: string; fr: boolean }) {
  const [rider, setRider] = useState<Identity | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/track/${orderCode}`)
        .then((r) => r.json())
        .then((d) => {
          if (alive) setRider((d.riderIdentity as Identity | null) ?? null);
        })
        .catch(() => {});
    load();
    // Cheap: the tracking screen is already polling this endpoint, and a rider
    // can be reassigned mid-order.
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [orderCode]);

  if (!rider) return null;

  const firstName = rider.fullName.trim().split(/\s+/)[0];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-violet-950/30 p-4">
      {mediaSrc(rider.photoUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaSrc(rider.photoUrl)!}
          alt={rider.fullName}
          className="h-14 w-14 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
          <User className="h-7 w-7" />
        </span>
      )}

      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-violet-300">
          {fr ? "Votre livreur ce soir" : "Your rider tonight"}
        </p>
        <p className="font-display text-base font-bold text-mist-100">{rider.fullName}</p>
        {rider.vehicleRef && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mist-300">
            <Bike className="h-3.5 w-3.5 text-violet-300" /> {rider.vehicleRef}
          </p>
        )}
        <p
          className={cn(
            "mt-1 flex items-center gap-1.5 text-xs",
            rider.idVerified ? "text-safe" : "text-mist-500"
          )}
        >
          <ShieldCheck className="h-3 w-3" />
          {rider.idVerified
            ? fr
              ? "Identité vérifiée par Urban Night Lift"
              : "ID checked by Urban Night Lift"
            : fr
              ? "Vérification en cours"
              : "Verification in progress"}
        </p>
      </div>

      <p className="ml-auto hidden max-w-[9rem] text-right text-xs leading-relaxed text-mist-500 sm:block">
        {fr
          ? `Ne donnez votre code qu'à ${firstName}, une fois le colis en main.`
          : `Only give your code to ${firstName}, once the goods are in your hands.`}
      </p>
    </div>
  );
}

/*
 * The `publicUrl` helper that used to live here was right — rider photos are in
 * a public bucket precisely so they render without a signing round-trip that
 * would expire mid-delivery. It was simply private to this one file, so the
 * food page could not reuse it and hand-rolled the wrong thing instead. It is
 * now `mediaSrc`, which knows every bucket rather than one.
 */
