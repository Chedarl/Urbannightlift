"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Store,
  Phone,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  StickyNote,
  X,
  Copy,
  Check,
} from "lucide-react";
import { buildWaLink } from "@/lib/whatsapp/links";
import { cn } from "@/lib/utils";
import { STANDING_LABEL, type MerchantStanding } from "@/lib/merchants/health";

/**
 * Merchants as relationships — the SMB half of the business.
 *
 * A catalogue tells you a shop exists; this tells you how the relationship is
 * doing. Who has signed up and needs verifying, who is selling well through us,
 * who has gone quiet, and who we have not called in too long. Each opens to a
 * contact log and the two things worth doing from here: confirm they are still
 * trading, and reach them.
 */

interface MerchantRow {
  id: string;
  name: string;
  category: string;
  neighbourhood: string | null;
  whatsappNumber: string;
  phone: string | null;
  logoUrl: string | null;
  socialUrl: string | null;
  verified: boolean;
  acceptingOrders: boolean;
  nightOpen: boolean;
  source: string;
  orderCount: number;
  notesCount: number;
  standing: MerchantStanding;
  summary: string;
  daysSinceLastOrder: number | null;
  daysSinceContact: number | null;
  reorderPercent: number;
  contactStale: boolean;
}

interface Payload {
  counts: { unverified: number; quiet: number; staleContact: number; total: number };
  merchants: MerchantRow[];
}

interface Note {
  id: string;
  body: string;
  kind: string;
  authorName: string;
  createdAt: string;
}

const POLL_MS = 60_000;

export function MerchantRelations() {
  const [data, setData] = useState<Payload | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query = "") => {
    try {
      const res = await fetch(`/api/admin/merchants-crm${query ? `?q=${encodeURIComponent(query)}` : ""}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* keep what's on screen */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(q.trim()), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, load]);

  if (!data) return <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-sm text-mist-400">Loading merchants…</p>;

  const open = data.merchants.find((m) => m.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tally label="To verify" value={data.counts.unverified} tone={data.counts.unverified > 0 ? "watch" : "calm"} />
        <Tally label="Gone quiet" value={data.counts.quiet} tone={data.counts.quiet > 0 ? "watch" : "calm"} />
        <Tally label="Stale contact" value={data.counts.staleContact} tone="calm" />
        <Tally label="Merchants" value={data.counts.total} tone="calm" />
        <button type="button" onClick={() => load(q.trim())} className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-mist-400 hover:text-mist-200">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a merchant or neighbourhood"
          className="w-full rounded-xl border border-ink-700 bg-ink-900 py-2.5 pl-9 pr-3 text-sm text-mist-100 placeholder:text-mist-600 focus:border-violet-500/60 focus:outline-none"
        />
      </label>

      <ul className="flex flex-col gap-2">
        {data.merchants.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setOpenId(m.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                !m.verified ? "border-caution/40 bg-caution/[0.04]" : "border-ink-800 bg-ink-900 hover:border-ink-600"
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-800 text-mist-400">
                {m.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-mist-100">{m.name}</span>
                  <StandingChip standing={m.standing} verified={m.verified} />
                </span>
                <span className="block truncate text-[11px] text-mist-500">{m.summary}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-mist-500">
                <span className="block font-display text-sm font-bold text-mist-200">{m.orderCount}</span>
                orders
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && <MerchantPanel merchant={open} onClose={() => setOpenId(null)} onChanged={() => load(q.trim())} />}
    </div>
  );
}

function MerchantPanel({ merchant: m, onClose, onChanged }: { merchant: MerchantRow; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const wa = m.whatsappNumber.replace(/\D/g, "");

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/merchants-crm/${m.id}/notes`, { cache: "no-store" });
      if (res.ok) setNotes((await res.json()).notes);
    } catch {
      /* ignore */
    }
  }, [m.id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/merchants-crm/${m.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setText("");
        await loadNotes();
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/merchant/join`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-ink-700 bg-ink-900 p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-ink-800 text-mist-400">
              {m.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Store className="h-5 w-5" />
              )}
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-mist-100">{m.name}</h2>
              <p className="text-xs text-mist-500">
                {m.category.toLowerCase()}
                {m.neighbourhood ? ` · ${m.neighbourhood}` : ""}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-ink-700 p-1.5 text-mist-500 hover:text-mist-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StandingChip standing={m.standing} verified={m.verified} />
          {m.nightOpen && <span className="rounded bg-safe/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-safe">Night open</span>}
          {!m.acceptingOrders && <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-mist-500">Paused</span>}
          {m.source === "signup" && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] uppercase text-violet-300">Signed up</span>}
        </div>
        <p className="mt-2 text-sm text-mist-300">{m.summary}</p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Orders" value={String(m.orderCount)} />
          <Stat label="Reorder" value={`${m.reorderPercent}%`} />
          <Stat label="Last confirmed" value={m.daysSinceContact == null ? "never" : `${m.daysSinceContact}d`} tone={m.contactStale ? "bad" : "plain"} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`tel:+${wa}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-700 py-2 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
          <a href={buildWaLink(wa, `Hello ${m.name} — Urban Night Lift here.`)} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-700 py-2 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          {m.socialUrl && (
            <a href={m.socialUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-3 py-2 text-xs font-semibold text-mist-300 hover:text-mist-100">
              <ExternalLink className="h-3.5 w-3.5" /> Page
            </a>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => post({ stillTrading: true })} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-safe/90 py-2 text-xs font-bold text-ink-950 hover:bg-safe disabled:opacity-50">
            <CheckCircle2 className="h-3.5 w-3.5" /> Still trading
          </button>
          <button type="button" onClick={copyInvite} className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-3 py-2 text-xs font-semibold text-mist-300 hover:text-mist-100">
            {copied ? <Check className="h-3.5 w-3.5 text-safe" /> : <Copy className="h-3.5 w-3.5" />} Invite link
          </button>
        </div>

        {/* Contact log */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
            <StickyNote className="h-3.5 w-3.5" /> Contact log
          </p>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did they say?"
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-2 text-sm text-mist-100 placeholder:text-mist-600 focus:outline-none"
            />
            <button type="button" onClick={() => post({ body: text, kind: "CALL" })} disabled={busy || !text.trim()} className="rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-mist-300 disabled:opacity-40">
              Log
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2 text-xs text-mist-300">
                <span className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-mist-500">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(n.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {n.authorName}
                </span>
                {n.body}
              </li>
            ))}
            {notes.length === 0 && <li className="text-xs text-mist-600">No contact logged yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StandingChip({ standing, verified }: { standing: MerchantStanding; verified: boolean }) {
  if (!verified) {
    return <span className="rounded bg-caution/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-caution">To verify</span>;
  }
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        standing === "GROWING" && "bg-safe/15 text-safe",
        standing === "STEADY" && "bg-ink-800 text-mist-400",
        (standing === "QUIET" || standing === "DORMANT") && "bg-restricted/15 text-restricted",
        standing === "NEW" && "bg-violet-500/15 text-violet-300"
      )}
    >
      {STANDING_LABEL[standing]}
    </span>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "watch" | "calm" }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", tone === "watch" ? "border-caution/40 bg-caution/[0.05]" : "border-ink-800 bg-ink-900")}>
      <p className={cn("font-display text-xl font-bold tabular-nums", tone === "watch" ? "text-caution" : "text-mist-200")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-mist-500">{label}</p>
    </div>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "bad" }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 px-2 py-2">
      <p className={cn("font-display text-sm font-bold tabular-nums", tone === "bad" ? "text-restricted" : "text-mist-100")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-mist-500">{label}</p>
    </div>
  );
}
