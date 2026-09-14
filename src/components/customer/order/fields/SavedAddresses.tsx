"use client";

import { useEffect, useState } from "react";
import { Home, Plus, Check, X } from "lucide-react";
import type { ZoneTier } from "@/lib/orders/pricing";
import type { SelectedLocation } from "@/lib/locations/types";
import { refreshProfile, savedAddressToLocation, useCustomerProfile, type SavedAddress } from "@/lib/account/profile";
import { cn } from "@/lib/utils";

interface ZoneLike {
  id: string;
  zoneName: string;
  tier: ZoneTier;
  feeXaf: number;
  centroidLat: number | null;
  centroidLng: number | null;
}

/**
 * A returning customer's places, one tap above the location picker.
 *
 * This is the whole point of having accounts at checkout: somebody on their
 * tenth order should not re-describe where they live. Guests see nothing at
 * all — no sign-in nag in the middle of an order.
 */
export function SavedAddresses({
  current,
  onPick,
  accent,
  fr,
}: {
  current: SelectedLocation | null;
  onPick: (loc: SelectedLocation) => void;
  accent: string;
  fr: boolean;
}) {
  const { profile } = useCustomerProfile();
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [zones, setZones] = useState<ZoneLike[]>([]);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) setAddresses(profile.addresses);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    fetch("/api/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
      .catch(() => {});
  }, [profile]);

  if (!profile || addresses == null) return null;

  const alreadySaved =
    current != null &&
    addresses.some((a) => a.locationText === locationTextOf(current));

  async function save() {
    if (!current) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || (fr ? "Mon adresse" : "My place"),
          locationText: locationTextOf(current),
          landmark: current.landmark ?? undefined,
          lat: current.latitude || undefined,
          lng: current.longitude || undefined,
          zoneId: current.zoneId ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.address) {
        setAddresses((prev) => {
          const rest = (prev ?? []).filter((a) => a.id !== data.address.id);
          return [...rest, data.address];
        });
        refreshProfile();
      }
    } finally {
      setBusy(false);
      setNaming(false);
      setLabel("");
    }
  }

  async function forget(id: string) {
    setAddresses((prev) => (prev ?? []).filter((a) => a.id !== id));
    refreshProfile();
    await fetch(`/api/account/addresses/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="mb-2 flex flex-col gap-2">
      {addresses.length > 0 && (
        <>
          <p className="text-xs text-mist-500">{fr ? "Vos adresses enregistrées" : "Your saved places"}</p>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
            {addresses.map((a) => {
              const picked = current != null && locationTextOf(current) === a.locationText;
              return (
                <span
                  key={a.id}
                  className={cn(
                    "group flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs",
                    picked ? "bg-ink-800" : "border-ink-700 bg-ink-800/60 text-mist-300"
                  )}
                  style={picked ? { borderColor: accent, color: accent } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => onPick(savedAddressToLocation(a, zones))}
                    className="flex items-center gap-1.5"
                  >
                    {picked ? <Check className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
                    <span className="font-medium">{a.label}</span>
                    <span className="max-w-[9rem] truncate text-mist-500">{a.locationText}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => forget(a.id)}
                    aria-label={fr ? "Oublier cette adresse" : "Forget this place"}
                    className="text-mist-500 hover:text-restricted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </>
      )}

      {current && !alreadySaved && (
        naming ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={fr ? "Maison, Bureau…" : "Home, Work…"}
              className="w-32 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-mist-100 focus:outline-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-950 disabled:opacity-60"
              style={{ backgroundColor: accent }}
            >
              {fr ? "Enregistrer" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setNaming(false)}
              className="text-xs text-mist-500"
            >
              {fr ? "Annuler" : "Cancel"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex w-fit items-center gap-1.5 rounded-xl border border-dashed border-ink-600 px-2.5 py-1.5 text-xs text-mist-400 hover:text-mist-200"
          >
            <Plus className="h-3 w-3" /> {fr ? "Enregistrer cette adresse" : "Save this place for next time"}
          </button>
        )
      )}
    </div>
  );
}

/** The same text the order forms write into `deliveryLocation`. */
function locationTextOf(loc: SelectedLocation): string {
  return `${loc.primaryName}${loc.neighbourhood ? ` — ${loc.neighbourhood}` : ""}`;
}
