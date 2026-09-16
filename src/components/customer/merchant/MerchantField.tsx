"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, MapPin, Phone, Search, Store, X } from "lucide-react";

import { merchantToLocation, placeToLocation, type ZoneData } from "@/lib/locations/fromMerchant";
import { BusinessCard, fromPlace, type BusinessAccent } from "@/components/customer/business/BusinessCard";
import type { PlaceBusiness } from "@/lib/maps/places";
import type { DiscoveredBusinessesResponse } from "@/app/api/places/businesses/route";
import { type SelectedLocation } from "@/lib/locations/types";
import type { MerchantResult } from "@/app/api/merchants/search/route";
import type { MerchantCategory } from "@prisma/client";
import { mediaSrc } from "@/lib/uploads/mediaSrc";
import { artworkFor, artworkStyle } from "@/lib/food/artwork";

/**
 * Pick the place we're collecting from.
 *
 * This used to be a bare text box: the customer typed "Mami Eru restaurant" and
 * the rider left with a name and nothing else — no pin, no phone number, and no
 * certainty the place exists under that spelling. Choosing a merchant here also
 * sets the pickup location from that merchant's own coordinates, so dispatch
 * routes to a point rather than to a guess.
 *
 * It must never be a wall. Our catalogue will always be missing someone's
 * favourite spot, so "not listed" stays one tap away and keeps the old
 * free-text behaviour intact.
 */

export function MerchantField({
  category,
  accent,
  fr,
  label,
  placeholder,
  value,
  merchantId,
  onPick,
  onFreeText,
  onDiscovered,
  cardAccent = "violet",
  error,
}: {
  category: MerchantCategory;
  accent: string;
  fr: boolean;
  label: string;
  placeholder: string;
  /** The name shown in the field — a chosen merchant's, or free text. */
  value: string;
  merchantId: string | null;
  /** A verified merchant, with the pickup location derived from its pin. */
  onPick: (merchant: MerchantResult, location: SelectedLocation) => void;
  /** Typed by hand: keep the name, leave the location field in charge. */
  onFreeText: (name: string) => void;
  /**
   * A business found on Google Maps, with the pickup location from its own pin.
   *
   * Optional, and the whole discovery tier is hidden when a form does not pass
   * it. A screen that cannot do anything with a found business must not be able
   * to show one — offering a result that does nothing when tapped is worse than
   * not offering it.
   */
  onDiscovered?: (business: PlaceBusiness, location: SelectedLocation) => void;
  /** Which service's colour this picker wears. Food amber, pharmacy emerald. */
  cardAccent?: BusinessAccent;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [zones, setZones] = useState<ZoneData[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Businesses found on the map, beneath our own.
   *
   * Deliberately a second request rather than a second source inside
   * `/api/merchants/search`: one of them reads our database and the other spends
   * money at Google, and merging them server-side would mean every keystroke in
   * the picker billed a Places search whether or not our own list had already
   * answered. This one only runs when ours comes back short.
   */
  const [found, setFound] = useState<PlaceBusiness[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [placesAvailable, setPlacesAvailable] = useState(true);

  useEffect(() => {
    fetch("/api/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const res = await fetch(`/api/merchants/search?category=${category}&q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setResults(d.results ?? []);
      } catch {
        setResults([]);
      }
      setSearching(false);
    },
    [category]
  );

  // Open with suggestions already on screen: most people don't know what we
  // have, and an empty list reads as "nothing here".
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => load(query), query ? 250 : 0);
    return () => clearTimeout(id);
  }, [open, query, load]);

  /*
   * Runs only when our own catalogue came back thin, and only when the screen
   * can actually use a find.
   *
   * Two queries deep is where somebody has told us they mean a specific place,
   * so a search before then would be spending on a half-typed word. Debounced
   * at 250 ms like every other search in this product.
   */
  useEffect(() => {
    if (!onDiscovered || !open) return;
    const q = query.trim();
    if (q.length < 2 || results.length >= 3) {
      setFound([]);
      return;
    }
    let live = true;
    setDiscovering(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/businesses?q=${encodeURIComponent(q)}&category=${category}`);
        const d = (await res.json()) as DiscoveredBusinessesResponse;
        if (!live) return;
        setPlacesAvailable(d.source !== "no-key");
        // Anything already in our own list is not a discovery. Matched on name
        // because a merchant row has no place id yet.
        const ours = new Set(results.map((r) => r.merchantName.trim().toLowerCase()));
        setFound((d.businesses ?? []).filter((b) => !ours.has(b.name.trim().toLowerCase())).slice(0, 6));
      } catch {
        if (live) setFound([]);
      } finally {
        if (live) setDiscovering(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, results, category, onDiscovered, open]);

  function pickFound(b: PlaceBusiness) {
    onDiscovered?.(b, placeToLocation(b, zones));
    setOpen(false);
    setQuery("");
  }

  function pick(m: MerchantResult) {
    if (m.latitude == null || m.longitude == null) {
      // Verified but never pinned: take the name and let the location field ask.
      onFreeText(m.merchantName);
      setOpen(false);
      return;
    }
    onPick(m, merchantToLocation({ ...m, latitude: m.latitude, longitude: m.longitude }, zones));
    setOpen(false);
    setQuery("");
  }

  const chosen = Boolean(merchantId);

  if (!open) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
          <Store className="h-3.5 w-3.5" style={{ color: accent }} />
          {label}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="mt-2 flex w-full items-center gap-2 rounded-xl border bg-ink-800 px-3 py-2.5 text-left text-sm"
          style={{ borderColor: error ? "#e0522f" : chosen ? accent : "#2a2340" }}
          data-error={error ? "true" : undefined}
        >
          {chosen ? (
            <Check className="h-4 w-4 shrink-0" style={{ color: accent }} />
          ) : (
            <Search className="h-4 w-4 shrink-0" style={{ color: accent }} />
          )}
          <span className={value ? "truncate text-mist-100" : "text-mist-500"}>{value || placeholder}</span>
        </button>
        {chosen && (
          <p className="mt-1 text-xs" style={{ color: accent }}>
            {fr
              ? "Adresse et téléphone confirmés — le livreur sait où aller."
              : "Address and phone confirmed — the rider knows where to go."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <p className="font-display text-sm font-semibold text-mist-100">{label}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-mist-400 hover:text-mist-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-mist-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {searching && <p className="py-6 text-center text-xs text-mist-500">{fr ? "Recherche…" : "Searching…"}</p>}

        {/*
          The dead end that became the seam.
          This used to be the whole answer when our catalogue had nothing:
          "type the name below". It is still the last word, but it is now the
          last of three, and it only speaks once discovery has also come up
          empty — otherwise it contradicts the results appearing underneath it.
        */}
        {!searching && !discovering && results.length === 0 && found.length === 0 && (
          <p className="py-6 text-center text-xs text-mist-500">
            {fr
              ? "Aucun établissement vérifié ne correspond. Saisissez le nom ci-dessous — nous appellerons pour confirmer."
              : "No verified place matches that. Type the name below — we'll call to confirm."}
          </p>
        )}

        {/*
          Ours first, and labelled as ours.
          The ranking is not a detail: a place somebody here has called and
          confirmed beats anything a map knows about this city, and the order of
          the two lists is where that is either said or left to chance.
        */}
        {results.length > 0 && found.length > 0 && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-mist-500">
            <Check className="h-3 w-3" style={{ color: accent }} />
            {fr ? "Confirmés par nous" : "Confirmed by us"}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => pick(m)}
                className="w-full rounded-xl border border-ink-700 bg-ink-900/50 px-3 py-2.5 text-left transition-colors hover:border-violet-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {/* The logo is what people actually recognize — far faster
                        than reading a name they half-remember.

                        A merchant without one now gets the same generated mark
                        the rest of the product uses. Before, ours appeared as
                        bare text while a business found on the map carried a
                        mark, so the one we had *not* called looked the more
                        substantial of the two — which is exactly backwards. */}
                    {mediaSrc(m.logoUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaSrc(m.logoUrl)!}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg border border-ink-700 object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold text-white/85"
                        style={artworkStyle(artworkFor(m.merchantName, "badge"))}
                      >
                        {artworkFor(m.merchantName).initials}
                      </span>
                    )}
                    <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-mist-100">{m.merchantName}</p>
                    <p className="truncate text-xs text-mist-500">
                      <MapPin className="mr-1 inline h-3 w-3" />
                      {m.neighbourhood ?? m.address}
                      {m.distanceKm != null && ` · ${m.distanceKm.toFixed(1)} km`}
                    </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.onDutyTonight && (
                      <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-xs font-semibold text-teal-300">
                        {fr ? "De garde ce soir" : "On duty tonight"}
                      </span>
                    )}
                    {m.open24h ? (
                      <span className="rounded-full bg-safe/15 px-2 py-0.5 text-xs font-semibold text-safe">24/7</span>
                    ) : (
                      m.openNow && (
                        <span className="rounded-full bg-safe/15 px-2 py-0.5 text-xs font-semibold text-safe">
                          <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                          {fr ? "Ouvert" : "Open now"}
                        </span>
                      )
                    )}
                    {m.productCount > 0 && (
                      <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-xs font-semibold text-gold-300">
                        {m.productCount} {fr ? "articles" : "items"}
                      </span>
                    )}
                  </div>
                </div>
                {m.phone && (
                  <p className="mt-1 text-xs text-mist-500">
                    <Phone className="mr-1 inline h-3 w-3" />
                    {m.phone}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/*
          Found on the map, beneath ours and never mixed into them.
          No menu, no prices, no rating and no photograph, because we hold none
          of those for a business nobody here has spoken to. What this offers is
          the thing we can honestly do: send a rider to a real address and call
          ahead. That is the free-text path the picker has always had, with a
          search in front of it instead of a blank box.
        */}
        {found.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-mist-500">
              <Search className="h-3 w-3" />
              {fr ? "Trouvés sur la carte" : "Found on the map"}
            </p>
            <ul className="flex flex-col gap-2">
              {found.map((b) => (
                <li key={b.placeId}>
                  <BusinessCard
                    business={fromPlace(b)}
                    accent={cardAccent}
                    fr={fr}
                    actionLabel={fr ? "Commander" : "Order"}
                    onSelect={() => pickFound(b)}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-mist-600">
              {fr
                ? "Nous n'avons pas encore parlé à ces établissements. Le livreur ira sur place et appellera avant d'acheter."
                : "We haven't spoken to these places yet. The rider goes there and calls before buying."}
            </p>
          </div>
        )}

        {discovering && results.length === 0 && (
          <p className="py-4 text-center text-xs text-mist-600">
            {fr ? "Recherche sur la carte…" : "Looking on the map…"}
          </p>
        )}

        {/*
          Said once, quietly, and only to somebody who searched and found
          nothing. Until the owner creates a Maps key this is the state this
          runs in, and "we cannot look right now" is a different sentence from
          "there is nothing there".
        */}
        {onDiscovered && !placesAvailable && !searching && results.length === 0 && query.trim().length >= 2 && (
          <p className="py-2 text-center text-xs text-mist-600">
            {fr
              ? "La recherche sur la carte n'est pas encore active — saisissez le nom ci-dessous."
              : "Map search isn't switched on yet — type the name below."}
          </p>
        )}
      </div>

      {/* The escape hatch. Our list will never cover every spot in Yaoundé, and
          an order refused because a vendor isn't catalogued is a lost order. */}
      <div className="border-t border-ink-700 px-4 py-3">
        <p className="mb-2 text-xs text-mist-500">
          {fr ? "Pas dans la liste ? Écrivez le nom :" : "Not listed? Type the name:"}
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={query.trim().length < 2}
            onClick={() => {
              onFreeText(query.trim());
              setOpen(false);
            }}
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            {fr ? "Utiliser" : "Use"}
          </button>
        </div>
      </div>
    </div>
  );
}
