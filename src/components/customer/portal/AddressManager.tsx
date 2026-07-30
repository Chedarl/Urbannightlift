"use client";

import { useEffect, useState } from "react";
import { Home as HomeIcon, Briefcase, MapPin, Trash2, Plus, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslation } from "@/lib/i18n";
import { refreshProfile, type SavedAddress } from "@/lib/account/profile";
import type { SelectedLocation } from "@/lib/locations/types";
import { PageHeader } from "@/components/shared/portalKit";

const LocationField = dynamic(
  () => import("@/components/customer/location/LocationField").then((m) => m.LocationField),
  { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-2xl border border-ink-700 bg-ink-900/50" /> }
);

/**
 * Where the customer keeps the places they order to.
 *
 * A ride app lets you set Home and Work once and never type them again; this is
 * that, for deliveries. The picker is the same `LocationField` used at
 * checkout, so a saved place carries a real pin — which is what lets the order
 * form quote the right zone the moment it is tapped, rather than guessing from
 * a line of text.
 */
export function AddressManager() {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [loc, setLoc] = useState<SelectedLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/account/addresses", { cache: "no-store" });
      if (res.ok) setAddresses((await res.json()).addresses);
    } catch {
      /* keep whatever is on screen */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!label.trim() || !loc) {
      setError(fr ? "Nommez le lieu et choisissez-le sur la carte." : "Name the place and pick it on the map.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          locationText: loc.primaryName,
          landmark: loc.landmark,
          lat: loc.latitude || null,
          lng: loc.longitude || null,
          zoneId: loc.zoneId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? (fr ? "Échec de l'enregistrement." : "Couldn't save."));
        return;
      }
      setAdding(false);
      setLabel("");
      setLoc(null);
      refreshProfile();
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setAddresses((a) => a?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/account/addresses/${id}`, { method: "DELETE" }).catch(() => {});
    refreshProfile();
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28 pt-6">
      <PageHeader title={fr ? "Vos adresses" : "Your places"} back="/account/profile" />

      {addresses == null ? (
        <p className="text-sm text-mist-500">{t("common.loading")}</p>
      ) : addresses.length === 0 && !adding ? (
        <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-center text-sm text-mist-400">
          {fr ? "Aucune adresse enregistrée pour l'instant." : "No saved places yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-mist-400">
                <PlaceIcon label={a.label} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-mist-100">{a.label}</span>
                <span className="block truncate text-xs text-mist-500">{a.locationText}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                className="shrink-0 rounded-lg p-1.5 text-mist-500 hover:text-restricted"
                aria-label={fr ? "Supprimer" : "Remove"}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/30 bg-ink-900 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-mist-300">{fr ? "Nom (ex. Maison, Bureau)" : "Name (e.g. Home, Work)"}</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              placeholder={fr ? "Maison" : "Home"}
              className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none"
            />
          </label>
          <LocationField label={fr ? "Le lieu" : "The place"} value={loc} onChange={setLoc} mode="delivery" />
          {error && <p className="text-xs text-restricted">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-bold text-ink-950 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {fr ? "Enregistrer" : "Save place"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-mist-300"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-ink-600 px-4 py-3 text-sm font-semibold text-mist-300 hover:border-violet-500/50 hover:text-mist-100"
        >
          <Plus className="h-4 w-4" /> {fr ? "Ajouter une adresse" : "Add a place"}
        </button>
      )}
    </div>
  );
}

function PlaceIcon({ label }: { label: string }) {
  const l = label.toLowerCase();
  if (l.includes("home") || l.includes("maison")) return <HomeIcon className="h-4 w-4" />;
  if (l.includes("work") || l.includes("bureau") || l.includes("travail")) return <Briefcase className="h-4 w-4" />;
  return <MapPin className="h-4 w-4" />;
}
