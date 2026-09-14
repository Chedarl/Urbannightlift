"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Search, Map as MapIcon, Crosshair, LayoutGrid, X, Check, ChevronRight, HelpCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { nearestZone, type ZoneTier } from "@/lib/orders/pricing";
import { encodePlusCode } from "@/lib/locations/plusCode";
import {
  SERVICE_STATUS_META,
  ARRONDISSEMENT_LABEL,
  tierToStatus,
  type SelectedLocation,
} from "@/lib/locations/types";
import type { LocationResult } from "@/app/api/locations/search/route";
import { cn } from "@/lib/utils";

const ConfirmMap = dynamic(() => import("@/components/customer/location/ConfirmMap").then((m) => m.ConfirmMap), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-2xl border border-ink-700 bg-ink-900/50" />,
});

interface ZoneData { id: string; zoneName: string; tier: ZoneTier; feeXaf: number; centroidLat: number | null; centroidLng: number | null }
interface BrowseGroup { arrondissement: string; locations: LocationResult[] }

type Tab = "search" | "browse" | "gps" | "map";

/**
 * A Places session token. Any opaque unique string works; Google only uses it to
 * group the keystrokes of one search with the single lookup that ends it.
 */
function newSessionToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}${Math.random().toString(36).slice(2)}`;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&accept-language=fr`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [a.road || a.neighbourhood || a.suburb, a.suburb || a.city_district, a.city || a.town || "Yaoundé"].filter(Boolean);
    return parts.length ? [...new Set(parts)].join(", ") : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

interface Draft {
  primaryName: string;
  neighbourhood: string;
  arrondissement: string;
  lat: number;
  lng: number;
  baseStatus: string;
  source: string;
}

export function LocationField({
  label,
  value,
  onChange,
  accent = "#9645de",
  error,
  mode = "delivery",
  suggestion,
}: {
  label: string;
  value: SelectedLocation | null;
  onChange: (loc: SelectedLocation | null) => void;
  accent?: string;
  error?: boolean;
  /** Which side this field collects. The prompt should never offer both. */
  mode?: "pickup" | "delivery";
  /**
   * A place *name* somebody mentioned — from the intake box, a voice note, a
   * merchant they picked. Offered as a one-tap search, never accepted as an
   * answer.
   *
   * The distinction is the whole point. A word like "Bastos" has no
   * coordinates, no zone and no tier, and this product computes the fee from
   * all three. Filling the field with it would mean inventing a price. Opening
   * the search with it already typed saves the customer the typing and leaves
   * the confirming — which is theirs — exactly where it was.
   */
  suggestion?: string | null;
}) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("search");
  const [zones, setZones] = useState<ZoneData[]>([]);

  /**
   * One token for a whole typing session, replaced when a session is closed by
   * picking something. Google bills a session at the moment it closes, so every
   * keystroke sharing a token costs nothing.
   */
  const sessionRef = useRef(newSessionToken());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [groups, setGroups] = useState<BrowseGroup[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // confirm step
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pinName, setPinName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [directions, setDirections] = useState("");
  const [contact, setContact] = useState("");
  const [resolved, setResolved] = useState<{ zoneId: string | null; zoneName: string | null; tier: ZoneTier | null; feeXaf: number | null; status: string } | null>(null);

  useEffect(() => {
    fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (tab !== "search" || query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/locations/search?q=${encodeURIComponent(query)}&lang=${fr ? "fr" : "en"}&session=${encodeURIComponent(sessionRef.current)}`
        );
        const d = await res.json();
        setResults(d.results ?? []);
      } catch { setResults([]); }
      setSearching(false);
    }, 250);
    return () => clearTimeout(id);
    // `fr` is in here because Google returns suggestions in the asked-for
    // language — switching locale mid-search should re-ask, not keep English
    // results under a French label.
  }, [query, tab, fr]);

  const loadBrowse = useCallback(() => {
    if (groups.length) return;
    fetch("/api/locations").then((r) => r.json()).then((d) => setGroups(d.groups ?? [])).catch(() => {});
  }, [groups.length]);

  const resolveStatus = useCallback((tier: ZoneTier | null, d: Draft): string => {
    if (d.baseStatus === "BLOCKED" || d.baseStatus === "TEMPORARILY_UNAVAILABLE") return d.baseStatus;
    if (d.arrondissement === "YAOUNDE_PERIPHERY" || d.source !== "local") return "REVIEW_REQUIRED";
    return tierToStatus(tier);
  }, []);

  const recalc = useCallback(async (lat: number, lng: number, d: Draft) => {
    const z = nearestZone(lat, lng, zones);
    const status = resolveStatus(z?.tier ?? null, d);
    setResolved({ zoneId: z?.id ?? null, zoneName: z?.zoneName ?? null, tier: z?.tier ?? null, feeXaf: z?.feeXaf ?? null, status });
    const name = await reverseGeocode(lat, lng);
    setPinName(name);
  }, [zones, resolveStatus]);

  const pickResult = useCallback(async (r: LocationResult) => {
    let lat = r.latitude;
    let lng = r.longitude;

    // A Google suggestion arrives without coordinates — that is what makes all
    // the typing before it free. Picking one closes the session, and this is the
    // single call Google actually bills for, so it happens here and nowhere else.
    if (lat == null || lng == null) {
      if (!r.placeId) return;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/locations/place?id=${encodeURIComponent(r.placeId)}&session=${encodeURIComponent(sessionRef.current)}`
        );
        const d = await res.json();
        if (!res.ok || !d?.found) return;
        lat = d.latitude;
        lng = d.longitude;
        // A token is good for exactly one completed session. Reusing it would
        // put every later search on a session Google has already closed.
        sessionRef.current = newSessionToken();
      } catch {
        return;
      } finally {
        setSearching(false);
      }
    }
    if (lat == null || lng == null) return;

    const d: Draft = {
      primaryName: r.primaryName, neighbourhood: r.neighbourhood, arrondissement: r.arrondissement,
      lat, lng, baseStatus: r.serviceStatus, source: r.source,
    };
    setDraft(d);
    setLandmark(r.landmark ?? "");
    setPinName(r.primaryName);
    recalc(lat, lng, d);
  }, [recalc]);

  const detectMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d: Draft = { primaryName: fr ? "Ma position" : "My location", neighbourhood: "Yaoundé", arrondissement: "YAOUNDE_PERIPHERY", lat: pos.coords.latitude, lng: pos.coords.longitude, baseStatus: "REVIEW_REQUIRED", source: "gps" };
        setDraft(d);
        recalc(pos.coords.latitude, pos.coords.longitude, d);
      },
      () => setTab("map"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [fr, recalc]);

  const movePin = useCallback((lat: number, lng: number) => {
    setDraft((prev) => {
      const base: Draft = prev ?? { primaryName: "Yaoundé", neighbourhood: "Yaoundé", arrondissement: "YAOUNDE_PERIPHERY", lat, lng, baseStatus: "REVIEW_REQUIRED", source: "map" };
      const next = { ...base, lat, lng };
      recalc(lat, lng, next);
      return next;
    });
  }, [recalc]);

  function reset() {
    setDraft(null); setResolved(null); setLandmark(""); setDirections(""); setContact(""); setPinName(""); setQuery(""); setResults([]);
  }

  function close() { setOpen(false); reset(); setTab("search"); }

  const statusMeta = resolved ? SERVICE_STATUS_META[resolved.status] : null;
  const blocked = statusMeta ? !statusMeta.ok : false;
  const needsLandmark = draft ? draft.source !== "local" && landmark.trim().length < 2 : false;

  function confirm() {
    if (!draft || !resolved || blocked || needsLandmark) return;
    const loc: SelectedLocation = {
      primaryName: draft.source === "local" ? draft.primaryName : pinName || draft.primaryName,
      neighbourhood: draft.neighbourhood,
      arrondissement: draft.arrondissement,
      latitude: draft.lat,
      longitude: draft.lng,
      plusCode: encodePlusCode(draft.lat, draft.lng) || null,
      landmark: landmark.trim() || null,
      directions: directions.trim() || null,
      contactAtLocation: contact.trim() || null,
      zoneId: resolved.zoneId,
      zoneName: resolved.zoneName,
      tier: resolved.tier,
      serviceStatus: resolved.status,
      feeXaf: resolved.feeXaf,
      source: draft.source,
    };
    onChange(loc);
    close();
  }

  const inConfirm = !!draft;

  // ─────────────────────────── Collapsed field ───────────────────────────
  if (!open) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-mist-300">{label}</label>
        {value ? (
          <div className="rounded-2xl border p-3" style={{ borderColor: `${accent}55` }} data-error={error ? "true" : undefined}>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-mist-100">{value.primaryName}</p>
                <p className="truncate text-xs text-mist-500">{value.neighbourhood} · {ARRONDISSEMENT_LABEL[value.arrondissement] ?? value.arrondissement}</p>
                {value.landmark && <p className="mt-0.5 truncate text-xs text-mist-400">📍 {value.landmark}</p>}
                <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${SERVICE_STATUS_META[value.serviceStatus]?.hex ?? accent}22`, color: SERVICE_STATUS_META[value.serviceStatus]?.hex ?? accent }}>
                  {fr ? SERVICE_STATUS_META[value.serviceStatus]?.fr : SERVICE_STATUS_META[value.serviceStatus]?.en}
                </span>
              </div>
              <button type="button" onClick={() => { setOpen(true); }} className="shrink-0 rounded-lg border border-ink-700 px-2 py-1 text-xs text-mist-300">
                {fr ? "Changer" : "Change"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border bg-ink-800 px-3 py-3 text-left text-sm text-mist-400"
            style={{ borderColor: error ? "#e0522f" : "#2a2340" }}
            data-error={error ? "true" : undefined}
          >
            <Search className="h-4 w-4" style={{ color: accent }} />
            {/* The prompt names only the side it is actually collecting, so a
                delivery field never invites a pickup address. */}
            {mode === "pickup"
              ? fr ? "Où devons-nous récupérer ?" : "Where should we pick up?"
              : fr ? "Où devons-nous livrer ?" : "Where should we deliver?"}
          </button>
        )}

        {/* What they already told us, offered rather than assumed. One tap opens
            the search with the word typed in; nothing is selected until they
            choose a real place, so the fee is still computed from a pin. */}
        {!value && suggestion && suggestion.trim().length > 1 && (
          <button
            type="button"
            onClick={() => {
              setQuery(suggestion.trim());
              setTab("search");
              setOpen(true);
            }}
            className="mt-2 flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-950/30 px-3 py-1.5 text-xs text-violet-200"
          >
            <Search className="h-3 w-3" />
            <span className="max-w-[16rem] truncate">{suggestion.trim()}</span>
            <span className="text-violet-400/70">{fr ? "· chercher" : "· find it"}</span>
          </button>
        )}
      </div>
    );
  }

  // ─────────────────────────── Modal ───────────────────────────
  const tabs: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: "search", icon: Search, label: fr ? "Rechercher" : "Search" },
    { id: "browse", icon: LayoutGrid, label: fr ? "Parcourir" : "Browse" },
    { id: "gps", icon: Crosshair, label: fr ? "Ma position" : "My location" },
    { id: "map", icon: MapIcon, label: fr ? "Carte" : "Map" },
  ];

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <p className="font-display text-sm font-semibold text-mist-100">{label}</p>
        <button type="button" onClick={close} className="rounded-lg p-1 text-mist-400 hover:text-mist-100"><X className="h-5 w-5" /></button>
      </div>

      {inConfirm ? (
        /* ───── Confirm step ───── */
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <button type="button" onClick={reset} className="mb-3 text-xs text-mist-400">← {fr ? "Retour à la recherche" : "Back to search"}</button>
          <p className="mb-2 text-sm font-semibold text-mist-100">{pinName || draft?.primaryName}</p>
          <ConfirmMap point={draft ? { lat: draft.lat, lng: draft.lng } : null} accent={accent} onMove={movePin} />
          <p className="mt-2 text-xs text-mist-500">{fr ? "Touchez la carte ou glissez le repère jusqu'à la position exacte." : "Tap the map or drag the pin to the exact position."}</p>

          {statusMeta && (
            <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: `${statusMeta.hex}55`, backgroundColor: `${statusMeta.hex}12`, color: statusMeta.hex }}>
              {fr ? statusMeta.fr : statusMeta.en}
              {blocked && <p className="mt-1 text-xs text-mist-300">{fr ? "Cet emplacement n'est pas disponible pour la livraison. Choisissez-en un autre ou contactez le dispatcher." : "This location is currently unavailable for delivery. Please choose another or contact the dispatcher."}</p>}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs text-mist-400">{fr ? "Point de repère le plus proche" : "Nearest landmark"}{needsLandmark && <span className="text-restricted"> *</span>}</label>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100" placeholder={fr ? "Ex. En face de la station-service" : "e.g. Opposite the petrol station"} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-mist-400">{fr ? "Indications supplémentaires" : "Additional directions"}</label>
              <textarea value={directions} onChange={(e) => setDirections(e.target.value)} className="min-h-16 w-full resize-y rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100" placeholder={fr ? "Entrez par le portail bleu, appelez à la jonction…" : "Enter through the blue gate, call at the junction…"} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-mist-400">{fr ? "Contact sur place (optionnel)" : "Contact at location (optional)"}</label>
              <input value={contact} onChange={(e) => setContact(e.target.value)} inputMode="tel" className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100" placeholder="+237 6XX XXX XXX" />
            </div>
          </div>

          <button
            type="button"
            onClick={confirm}
            disabled={blocked || needsLandmark || !resolved}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-ink-950 disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            <Check className="h-5 w-5" /> {fr ? "Confirmer cet emplacement" : "Confirm this location"}
          </button>
        </div>
      ) : (
        /* ───── Tabs ───── */
        <>
          <div className="flex gap-1 border-b border-ink-700 px-2">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => { setTab(tb.id); if (tb.id === "browse") loadBrowse(); if (tb.id === "gps") detectMyLocation(); if (tb.id === "map") movePin(3.848, 11.502); }}
                className={cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium", tab === tb.id ? "text-mist-100" : "text-mist-500")}
                style={tab === tb.id ? { borderBottom: `2px solid ${accent}` } : undefined}
              >
                <tb.icon className="h-4 w-4" /> {tb.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {tab === "search" && (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3">
                  <Search className="h-4 w-4 text-mist-500" />
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none" placeholder={fr ? "Quartier, repère, Plus Code…" : "Area, landmark, Plus Code…"} />
                </div>
                {searching && <p className="mt-3 text-xs text-mist-500">{fr ? "Recherche…" : "Searching…"}</p>}
                <div className="mt-3 flex flex-col gap-2">
                  {results.map((r) => (
                    <ResultRow key={r.id} r={r} fr={fr} onPick={() => pickResult(r)} />
                  ))}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <button type="button" onClick={() => { setTab("map"); movePin(3.848, 11.502); }} className="flex items-center gap-2 rounded-xl border border-dashed border-ink-700 px-3 py-3 text-sm text-mist-300">
                      <HelpCircle className="h-4 w-4" style={{ color: accent }} /> {fr ? "Vous ne trouvez pas ? Choisissez sur la carte" : "Can't find it? Choose on the map"}
                    </button>
                  )}
                </div>
              </>
            )}

            {tab === "browse" && (
              <div className="flex flex-col gap-2">
                {groups.map((g) => (
                  <div key={g.arrondissement} className="overflow-hidden rounded-xl border border-ink-700">
                    <button type="button" onClick={() => setOpenGroup(openGroup === g.arrondissement ? null : g.arrondissement)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-mist-100">
                      {ARRONDISSEMENT_LABEL[g.arrondissement] ?? g.arrondissement}
                      <ChevronRight className={cn("h-4 w-4 transition-transform", openGroup === g.arrondissement && "rotate-90")} />
                    </button>
                    {openGroup === g.arrondissement && (
                      <div className="flex flex-col divide-y divide-ink-800 border-t border-ink-800">
                        {g.locations.map((r) => (
                          <ResultRow key={r.id} r={r} fr={fr} onPick={() => pickResult(r)} flat />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "gps" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Crosshair className="h-8 w-8" style={{ color: accent }} />
                <p className="text-sm text-mist-300">{fr ? "Autorisez l'accès à votre position pour placer le repère." : "Allow location access to drop the pin."}</p>
                <button type="button" onClick={detectMyLocation} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-950" style={{ backgroundColor: accent }}>
                  {fr ? "Utiliser ma position actuelle" : "Use my current location"}
                </button>
              </div>
            )}

            {tab === "map" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <MapIcon className="h-8 w-8" style={{ color: accent }} />
                <p className="text-sm text-mist-300">{fr ? "Ouvrez la carte et placez le repère." : "Open the map and drop the pin."}</p>
                <button type="button" onClick={() => movePin(3.848, 11.502)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-950" style={{ backgroundColor: accent }}>
                  {fr ? "Choisir sur la carte" : "Choose on map"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ResultRow({ r, fr, onPick, flat }: { r: LocationResult; fr: boolean; onPick: () => void; flat?: boolean }) {
  const meta = SERVICE_STATUS_META[r.serviceStatus];
  return (
    <button type="button" onClick={onPick} className={cn("flex items-center gap-3 px-3 py-2.5 text-left", flat ? "" : "rounded-xl border border-ink-700 bg-ink-900/40")}>
      <MapPin className="h-4 w-4 shrink-0 text-mist-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist-100">{r.primaryName}</p>
        <p className="truncate text-xs text-mist-500">
          {r.neighbourhood} · {ARRONDISSEMENT_LABEL[r.arrondissement] ?? r.arrondissement}
        </p>
      </div>
      {meta && <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${meta.hex}22`, color: meta.hex }}>{fr ? meta.fr : meta.en}</span>}
    </button>
  );
}
