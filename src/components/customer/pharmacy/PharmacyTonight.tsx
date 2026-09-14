"use client";

import { useEffect, useState } from "react";
import { Check, Clock, MapPin, Phone, Pill, ShieldCheck, Store } from "lucide-react";

import { merchantToLocation, type ZoneData } from "@/lib/locations/fromMerchant";
import type { SelectedLocation } from "@/lib/locations/types";
import type { BrowsePharmacy, ShelfItem } from "@/app/api/pharmacy/browse/route";
import { formatXaf } from "@/lib/utils";
import { mediaSrc } from "@/lib/uploads/mediaSrc";

/**
 * Who is open tonight, shown rather than searched for.
 *
 * The pharmacy name field below this is a search box, and a search box is the
 * right tool when you know the name. At 1 AM with a sick child you do not: the
 * question is "who is open at all", and the answer is the *pharmacie de garde*
 * rotation, which this product has been storing since v11 and using only to
 * nudge the ranking of a search nobody was performing.
 *
 * **This is not the food grid, and the difference is the point.** A restaurant
 * page shows every dish with a price and a plus button. A pharmacy cannot:
 * dispensing prescription medicine is controlled by the Ordre des Pharmaciens.
 * So the only items that appear here are ones a person ticked as
 * over-the-counter, and the prescription route is untouched — upload it, no
 * prices, no cart, the pharmacist decides what is dispensed.
 *
 * When nobody is catalogued this renders nothing at all. The form below works
 * exactly as it did, which is what an empty catalogue should look like.
 */

export function PharmacyTonight({
  fr,
  accent,
  selectedId,
  onPick,
  onAddItem,
}: {
  fr: boolean;
  accent: string;
  selectedId: string | null;
  onPick: (pharmacy: BrowsePharmacy, location: SelectedLocation | null) => void;
  /** Tapping a shelf item adds it to the medicine list the customer already has. */
  onAddItem: (item: ShelfItem) => void;
}) {
  const [rows, setRows] = useState<BrowsePharmacy[] | null>(null);
  const [zones, setZones] = useState<ZoneData[]>([]);

  useEffect(() => {
    fetch("/api/pharmacy/browse")
      .then((r) => r.json())
      .then((d) => setRows(d.pharmacies ?? []))
      // A failed browse is not a failed order. The search box below still works.
      .catch(() => setRows([]));
    fetch("/api/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
      .catch(() => {});
  }, []);

  // Nothing to show and nothing to apologise for.
  if (!rows || rows.length === 0) return null;

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const shelf = selected?.shelf ?? [];

  function pick(p: BrowsePharmacy) {
    const location =
      p.latitude != null && p.longitude != null
        ? merchantToLocation(
            {
              merchantName: p.name,
              neighbourhood: p.neighbourhood,
              address: p.address,
              landmark: p.landmark,
              latitude: p.latitude,
              longitude: p.longitude,
              phone: p.phone,
            },
            zones
          )
        : // Verified but never pinned: take the name and let the location field
          // ask, exactly as the merchant picker does.
          null;
    onPick(p, location);
  }

  return (
    <div className="rounded-2xl border border-teal-500/25 bg-teal-950/20 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-teal-300" />
        <p className="text-sm font-semibold text-mist-100">
          {fr ? "Ouvert cette nuit" : "Open tonight"}
        </p>
        <span className="text-xs text-mist-500">
          {fr ? "Touchez pour choisir" : "Tap to choose"}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((p) => {
          const on = p.id === selectedId;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${
                  on ? "border-teal-400 bg-teal-500/15" : "border-ink-700 bg-ink-900/60"
                }`}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-800 text-teal-300">
                  {mediaSrc(p.logoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaSrc(p.logoUrl)!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-4 w-4" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-mist-100">{p.name}</span>
                    {/* The pharmacy on duty is obliged to be open. At 2 AM it is
                        very often the only correct answer, so it says so first. */}
                    {p.onDutyTonight && (
                      <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-xs font-semibold text-gold-300">
                        {fr ? "De garde ce soir" : "On duty tonight"}
                      </span>
                    )}
                    {p.open24h && (
                      <span className="rounded-full bg-safe/15 px-2 py-0.5 text-xs font-semibold text-safe">
                        24h
                      </span>
                    )}
                  </span>

                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-mist-500">
                    {p.neighbourhood && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {p.neighbourhood}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 ${p.openNow ? "text-safe" : "text-mist-500"}`}>
                      <Clock className="h-3 w-3" />
                      {p.openNow
                        ? fr ? "Ouvert" : "Open now"
                        : p.onDutyTonight
                          ? fr ? "De garde — appelez avant" : "On duty — we'll call ahead"
                          : fr ? "Fermé" : "Closed"}
                    </span>
                    {p.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </span>
                    )}
                  </span>
                </span>

                {on && <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: accent }} />}
              </button>
            </li>
          );
        })}
      </ul>

      {shelf.length > 0 && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900/60 p-3">
          <div className="flex items-center gap-2">
            <Pill className="h-3.5 w-3.5 text-teal-300" />
            <p className="text-xs font-semibold text-mist-200">
              {fr ? "Sans ordonnance, en rayon" : "On the shelf, no prescription"}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {shelf.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onAddItem(it)}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs text-mist-200"
              >
                <span>{fr && it.nameFr ? it.nameFr : it.name}</span>
                {it.priceXaf != null && (
                  <span className="font-semibold text-teal-300">{formatXaf(it.priceXaf)}</span>
                )}
              </button>
            ))}
          </div>
          {/*
            Said out loud rather than implied. Every shopping service in this
            product settles on the receipt the rider photographs, and a price
            shown here that turns out to be last month's is how a delivery ends
            in an argument at the door.
          */}
          <p className="mt-2 text-xs leading-relaxed text-mist-500">
            {fr
              ? "Prix indicatifs de la pharmacie. Le montant exact est celui du reçu, photographié par le livreur."
              : "The pharmacy's own prices, as a guide. What you pay is what the receipt says — the rider photographs it."}
          </p>
        </div>
      )}
    </div>
  );
}
