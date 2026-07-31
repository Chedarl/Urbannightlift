"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamicImport from "next/dynamic";
import { MapPin, Search, Plus, AlertTriangle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { cn } from "@/lib/utils";

const ConfirmMap = dynamicImport(
  () => import("@/components/customer/location/ConfirmMap").then((m) => m.ConfirmMap),
  {
    ssr: false,
    loading: () => <div className="h-[260px] animate-pulse rounded-2xl border border-ink-700 bg-ink-900/50" />,
  }
);

/**
 * The address book, and the queue of addresses that are failing customers.
 *
 * This is the highest-leverage screen in the admin console, for a reason that
 * is easy to miss: in Yaoundé an address is a landmark, not a postal line, so
 * no map provider — Google included — can look one up. The catalogue can, and
 * `resolveAddress` already ranks it above everything external.
 *
 * The *Not found* tab is the point. Every geocode attempt has been logged since
 * the address work shipped and read by nobody; those rows are a list of exactly
 * which addresses this operation cannot find, ordered by how many customers
 * each has already failed. Fixing the top row fixes it for everyone who types
 * it next.
 */

const ARRONDISSEMENTS = [
  "YAOUNDE_I", "YAOUNDE_II", "YAOUNDE_III", "YAOUNDE_IV",
  "YAOUNDE_V", "YAOUNDE_VI", "YAOUNDE_VII", "YAOUNDE_PERIPHERY",
] as const;

interface LocationRow {
  id: string;
  primaryName: string;
  aliases: string[];
  neighbourhood: string;
  arrondissement: string;
  landmark: string | null;
  latitude: number;
  longitude: number;
  serviceStatus: string;
  active: boolean;
  popularityRank: number;
  source: string;
}

interface Gap {
  text: string;
  count: number;
  lastAt: string;
}

interface Learned {
  id: string;
  text: string;
  latitude: number;
  longitude: number;
  confirmations: number;
  personal: boolean;
}

type Tab = "failing" | "learned" | "catalogue";

/** What we are adding, and where it came from. */
interface Draft {
  primaryName: string;
  rawText: string;
  neighbourhood: string;
  arrondissement: string;
  landmark: string;
  lat: number;
  lng: number;
  source: string;
}

const YAOUNDE = { lat: 3.848, lng: 11.502 };
const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

export function LocationsManager() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("failing");
  const [gaps, setGaps] = useState<{ failing: Gap[]; weak: Gap[]; learned: Learned[] } | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGaps = useCallback(async () => {
    const res = await fetch("/api/admin/locations/gaps");
    if (res.ok) setGaps(await res.json());
  }, []);

  const loadCatalogue = useCallback(async (q: string) => {
    const res = await fetch(`/api/admin/locations?q=${encodeURIComponent(q)}`);
    if (res.ok) setLocations((await res.json()).locations ?? []);
  }, []);

  useEffect(() => {
    loadGaps();
    loadCatalogue("");
  }, [loadGaps, loadCatalogue]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryName: draft.primaryName,
          rawText: draft.rawText,
          neighbourhood: draft.neighbourhood,
          arrondissement: draft.arrondissement,
          landmark: draft.landmark,
          latitude: draft.lat,
          longitude: draft.lng,
          source: draft.source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "That didn't save.");
        return;
      }
      setDraft(null);
      await Promise.all([loadGaps(), loadCatalogue(query)]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setActive(row: LocationRow, active: boolean) {
    await fetch("/api/admin/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active }),
    });
    loadCatalogue(query);
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "failing", label: "Not found", count: gaps?.failing.length },
    { id: "learned", label: "Learned by delivering", count: gaps?.learned.length },
    { id: "catalogue", label: "The catalogue", count: locations.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Places</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-mist-400">
          People here navigate by landmarks, not street addresses, so no map
          provider can look one up — this list can. It is the one thing that
          makes finding a door easier tonight than it was last month.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              tab === x.id
                ? "border-violet-500 bg-violet-500/15 text-violet-200"
                : "border-ink-700 text-mist-400 hover:text-mist-200"
            )}
          >
            {x.label}
            {x.count != null && <span className="ml-1.5 tabular-nums opacity-70">{x.count}</span>}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------- Not found */}
      {tab === "failing" && (
        <>
          {gaps == null ? (
            <p className="text-sm text-mist-500">Reading the address log…</p>
          ) : gaps.failing.length === 0 && gaps.weak.length === 0 ? (
            <p className="rounded-2xl border border-safe/30 bg-safe/5 p-6 text-sm text-safe">
              Nothing has failed recently. Every address a customer typed was found.
            </p>
          ) : (
            <>
              {gaps.failing.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-caution">
                    <AlertTriangle className="h-4 w-4" />
                    We found nothing at all
                  </h2>
                  <p className="mb-3 text-xs leading-relaxed text-mist-500">
                    A customer typed this and we had no idea where it was. Most
                    frequent first — the top row is the most expensive one to
                    leave broken.
                  </p>
                  <GapList
                    rows={gaps.failing}
                    onAdd={(g) =>
                      setDraft({
                        primaryName: g.text,
                        rawText: g.text,
                        neighbourhood: "",
                        arrondissement: "YAOUNDE_PERIPHERY",
                        landmark: "",
                        lat: YAOUNDE.lat,
                        lng: YAOUNDE.lng,
                        source: "failed_address",
                      })
                    }
                  />
                </section>
              )}

              {gaps.weak.length > 0 && (
                <section className="mt-4">
                  <h2 className="mb-2 text-sm font-semibold text-mist-300">
                    We guessed, but weakly
                  </h2>
                  <p className="mb-3 text-xs leading-relaxed text-mist-500">
                    These resolved to a low-confidence pin, which on a night
                    delivery can be a street away — and a street away is a failed
                    first attempt.
                  </p>
                  <GapList
                    rows={gaps.weak}
                    onAdd={(g) =>
                      setDraft({
                        primaryName: g.text,
                        rawText: g.text,
                        neighbourhood: "",
                        arrondissement: "YAOUNDE_PERIPHERY",
                        landmark: "",
                        lat: YAOUNDE.lat,
                        lng: YAOUNDE.lng,
                        source: "weak_match",
                      })
                    }
                  />
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------------ Learned */}
      {tab === "learned" && (
        <>
          <p className="text-xs leading-relaxed text-mist-500">
            Places a rider has actually delivered to. These already work in
            search as coordinates against a string; naming one puts it in the
            catalogue so it starts matching the other ways people write it.
          </p>
          {gaps?.learned.length === 0 ? (
            <p className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-mist-500">
              Nothing confirmed twice yet. This fills up as deliveries complete.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {gaps?.learned.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-mist-100">{p.text}</p>
                    <p className="text-xs text-mist-500">
                      {p.confirmations} deliveries landed here
                      {p.personal && " · one customer's own address"}
                    </p>
                  </div>
                  {/* A personal place is somebody's home. Naming it in a public
                      catalogue would publish where a specific customer lives. */}
                  {p.personal ? (
                    <Badge tone="violet">Private</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          primaryName: p.text,
                          rawText: p.text,
                          neighbourhood: "",
                          arrondissement: "YAOUNDE_PERIPHERY",
                          landmark: "",
                          lat: p.latitude,
                          lng: p.longitude,
                          source: "delivered",
                        })
                      }
                    >
                      <Sparkles className="h-4 w-4" /> Name it
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------------- Catalogue */}
      {tab === "catalogue" && (
        <>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-mist-500" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  loadCatalogue(e.target.value);
                }}
                placeholder="Name or neighbourhood"
                className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none"
              />
            </div>
            <Button
              size="sm"
              onClick={() =>
                setDraft({
                  primaryName: "",
                  rawText: "",
                  neighbourhood: "",
                  arrondissement: "YAOUNDE_PERIPHERY",
                  landmark: "",
                  lat: YAOUNDE.lat,
                  lng: YAOUNDE.lng,
                  source: "admin",
                })
              }
            >
              <Plus className="h-4 w-4" /> Add a place
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {locations.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-mist-100">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-mist-500" />
                    {l.primaryName}
                    {!l.active && <Badge tone="restricted">Off</Badge>}
                  </p>
                  <p className="text-xs text-mist-500">
                    {l.neighbourhood}
                    {l.aliases.length > 0 && ` · also: ${l.aliases.slice(0, 3).join(", ")}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActive(l, !l.active)}>
                  {l.active ? "Turn off" : "Turn on"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------------- The add sheet */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-lg rounded-t-3xl border border-ink-700 bg-ink-900 p-5 sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-mist-100">Add this place</h2>
                {draft.rawText && (
                  <p className="mt-0.5 text-xs text-mist-500">
                    A customer typed “{draft.rawText}”. That exact wording is kept
                    as an alias, so the next person who types it gets a match.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg p-1 text-mist-500 hover:text-mist-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs text-mist-500">
                Name
                <input
                  className={`${inputCls} mt-1`}
                  value={draft.primaryName}
                  onChange={(e) => setDraft({ ...draft, primaryName: e.target.value })}
                  placeholder="Carrefour Nsam"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-mist-500">
                  Neighbourhood
                  <input
                    className={`${inputCls} mt-1`}
                    value={draft.neighbourhood}
                    onChange={(e) => setDraft({ ...draft, neighbourhood: e.target.value })}
                    placeholder="Nsam"
                  />
                </label>
                <label className="text-xs text-mist-500">
                  Arrondissement
                  <select
                    className={`${inputCls} mt-1`}
                    value={draft.arrondissement}
                    onChange={(e) => setDraft({ ...draft, arrondissement: e.target.value })}
                  >
                    {ARRONDISSEMENTS.map((a) => (
                      <option key={a} value={a}>
                        {a.replace("YAOUNDE_", "Yaoundé ").replace("PERIPHERY", "periphery")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="text-xs text-mist-500">
                Landmark — what a rider actually looks for
                <input
                  className={`${inputCls} mt-1`}
                  value={draft.landmark}
                  onChange={(e) => setDraft({ ...draft, landmark: e.target.value })}
                  placeholder="Opposite the Total station, blue gate"
                />
              </label>

              <div>
                <p className="mb-1.5 text-xs text-mist-500">
                  Drop the pin where a rider should actually stop.
                </p>
                <ConfirmMap
                  point={{ lat: draft.lat, lng: draft.lng }}
                  accent="#d4af37"
                  onMove={(lat, lng) => setDraft({ ...draft, lat, lng })}
                />
                <p className="mt-1.5 text-[11px] text-mist-500">
                  The zone and delivery fee are worked out from this pin, the same
                  way a customer&apos;s address is.
                </p>
              </div>

              {error && <p className="text-xs text-restricted">{error}</p>}

              <Button onClick={save} disabled={busy || draft.primaryName.trim().length < 2}>
                Add to the catalogue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GapList({ rows, onAdd }: { rows: Gap[]; onAdd: (g: Gap) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((g) => (
        <div
          key={g.text}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm text-mist-100">{g.text}</p>
            <p className="text-xs text-mist-500">
              {g.count === 1 ? "once" : `${g.count} times`} · last{" "}
              {new Date(g.lastAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onAdd(g)}>
            <Plus className="h-4 w-4" /> Add it
          </Button>
        </div>
      ))}
    </div>
  );
}
