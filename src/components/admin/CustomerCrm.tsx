"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Phone,
  MessageCircle,
  Star,
  ShieldAlert,
  Gift,
  StickyNote,
  Tag,
  Clock,
  MapPin,
  Package,
  AlertTriangle,
  Coins,
  X,
} from "lucide-react";
import { buildWaLink } from "@/lib/whatsapp/links";
import { formatXaf, cn } from "@/lib/utils";
import { GOODWILL_MAX_XAF, RISK_LABEL, TIER_LABEL, type CustomerRisk, type CustomerTier } from "@/lib/customers/health";

/**
 * The customer, not the order.
 *
 * The admin already had an orders table and a customers list, and neither of
 * them helps on a phone call: one is a list of transactions and the other is a
 * list of names. What a support desk actually needs is the person — everything
 * that has happened to them in one thread, a straight answer about who they are
 * to this business, and the ability to finish the call without opening another
 * screen.
 *
 * So every action a call can end in lives on this panel: a note, a tag, money
 * back, a block. Each one is written down with the name of whoever did it,
 * because a business that hands out credit and refuses service has to be able
 * to answer for both later.
 */

interface Found {
  id: string;
  fullName: string;
  whatsappNumber: string;
  language: string;
  hasAccount: boolean;
  tags: string[];
  creditXaf: number;
  delivered: number;
  tier: CustomerTier;
  risk: CustomerRisk;
  summary: string;
  daysSinceLastOrder: number | null;
}

interface Timeline {
  kind: "ORDER" | "CASE" | "NOTE" | "CREDIT";
  at: string;
  title: string;
  detail: string;
  tone: "GOOD" | "BAD" | "NEUTRAL";
  href?: string;
}

interface Profile {
  customer: {
    id: string;
    fullName: string;
    whatsappNumber: string;
    alternativePhone: string | null;
    language: string;
    hasAccount: boolean;
    memberSince: string;
    lastLoginAt: string | null;
    tags: string[];
    blockedAt: string | null;
    blockedReason: string | null;
    legacyNote: string | null;
    referralCode: string | null;
    creditXaf: number;
    friendsBrought: number;
    addresses: { id: string; label: string; locationText: string }[];
  };
  stats: {
    tier: CustomerTier;
    risk: CustomerRisk;
    summary: string;
    delivered: number;
    cancelled: number;
    openCases: number;
    lifetimeSpendXaf: number;
    averageOrderXaf: number;
    cancelRatePercent: number;
    daysSinceLastOrder: number | null;
  };
  timeline: Timeline[];
}

/** The handful of things a support desk actually wants to label somebody. */
const SUGGESTED_TAGS = ["VIP", "Careful", "Late payer", "Prefers French", "Gate code needed", "Repeat complaint"];

export function CustomerCrm({ canBlock }: { canBlock: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/crm?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        if (res.ok) setResults((await res.json()).customers);
      } catch {
        // A failed search should leave the last results on screen rather than
        // clearing what somebody is reading.
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  const loadProfile = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/crm/${id}`, { cache: "no-store" });
      if (res.ok) setProfile(await res.json());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (openId) loadProfile(openId);
    else setProfile(null);
  }, [openId, loadProfile]);

  async function act(payload: Record<string, unknown>): Promise<string | null> {
    if (!openId) return "No customer open.";
    const res = await fetch(`/api/admin/crm/${openId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return typeof data.error === "string" ? data.error : "That didn't work.";
    await loadProfile(openId);
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, WhatsApp number, order code or referral code"
          className="w-full rounded-xl border border-ink-700 bg-ink-900 py-2.5 pl-9 pr-3 text-sm text-mist-100 placeholder:text-mist-600 focus:border-violet-500/60 focus:outline-none"
        />
      </label>

      {results && results.length === 0 && (
        <p className="rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm text-mist-500">
          Nobody matches that. Try the last six digits of their number.
        </p>
      )}

      {results && results.length > 0 && !openId && (
        <ul className="flex flex-col gap-2">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="w-full rounded-xl border border-ink-800 bg-ink-900 p-3 text-left transition-colors hover:border-violet-500/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-mist-100">{c.fullName}</span>
                  <TierChip tier={c.tier} />
                  {c.risk !== "NONE" && <RiskChip risk={c.risk} />}
                  {!c.hasAccount && (
                    <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-mist-500">Guest</span>
                  )}
                  <span className="ml-auto text-xs tabular-nums text-mist-500">+{c.whatsappNumber}</span>
                </div>
                <p className="mt-1 text-xs text-mist-400">{c.summary}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && (
        <ProfilePanel
          profile={profile}
          busy={busy}
          canBlock={canBlock}
          onClose={() => setOpenId(null)}
          onAct={act}
        />
      )}
    </div>
  );
}

function ProfilePanel({
  profile,
  busy,
  canBlock,
  onClose,
  onAct,
}: {
  profile: Profile | null;
  busy: boolean;
  canBlock: boolean;
  onClose: () => void;
  onAct: (payload: Record<string, unknown>) => Promise<string | null>;
}) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!profile) {
    return (
      <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-sm text-mist-400">
        {busy ? "Opening…" : "Couldn't load that customer."}
      </p>
    );
  }

  const { customer: c, stats, timeline } = profile;

  async function run(payload: Record<string, unknown>, clear?: () => void) {
    setSaving(true);
    setError(await onAct(payload));
    setSaving(false);
    clear?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-mist-100">{c.fullName}</h2>
              <TierChip tier={stats.tier} />
              {stats.risk !== "NONE" && <RiskChip risk={stats.risk} />}
              {!c.hasAccount && (
                <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-mist-500">Guest</span>
              )}
            </div>
            <p className="mt-1 text-sm text-mist-300">{stats.summary}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-ink-700 p-1.5 text-mist-500 hover:text-mist-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {c.blockedAt && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-restricted/50 bg-restricted/[0.07] p-3 text-xs text-restricted">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Do not serve.</strong> {c.blockedReason}
            </span>
          </p>
        )}

        {/* Reach them. Two taps, no other screen. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={`tel:+${c.whatsappNumber.replace(/\D/g, "")}`}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe"
          >
            <Phone className="h-3.5 w-3.5" /> Call +{c.whatsappNumber}
          </a>
          <a
            href={buildWaLink(c.whatsappNumber, `Urban Night Lift — hello ${c.fullName.split(" ")[0]},`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <span className="text-[11px] text-mist-500">
            {c.language === "FR" ? "Speaks French" : "Speaks English"} · since{" "}
            {new Date(c.memberSince).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Delivered" value={String(stats.delivered)} />
        <Stat label="Lifetime" value={formatXaf(stats.lifetimeSpendXaf)} />
        <Stat label="Average order" value={formatXaf(stats.averageOrderXaf)} />
        <Stat
          label="Cancelled"
          value={`${stats.cancelled}${stats.cancelRatePercent > 0 ? ` · ${stats.cancelRatePercent}%` : ""}`}
          tone={stats.cancelRatePercent >= 40 ? "bad" : "plain"}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
            <Coins className="h-3.5 w-3.5" /> Credit &amp; referrals
          </p>
          <p className="mt-1.5 text-sm text-mist-200">
            {formatXaf(c.creditXaf)} unspent
            {c.referralCode && <span className="ml-2 text-xs text-mist-500">code {c.referralCode}</span>}
          </p>
          <p className="text-xs text-mist-500">
            {c.friendsBrought} friend{c.friendsBrought === 1 ? "" : "s"} brought in
          </p>
        </div>
        <div className="rounded-xl border border-ink-800 bg-ink-900 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
            <MapPin className="h-3.5 w-3.5" /> Saved places
          </p>
          {c.addresses.length === 0 ? (
            <p className="mt-1.5 text-xs text-mist-500">None saved.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {c.addresses.slice(0, 4).map((a) => (
                <li key={a.id} className="truncate text-xs text-mist-300">
                  <span className="font-medium">{a.label}</span> · {a.locationText}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <TagEditor
        tags={c.tags}
        saving={saving}
        onSave={(tags) => run({ action: "tags", tags })}
      />

      {/* The three ways a call ends. */}
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
          <StickyNote className="h-3.5 w-3.5" /> Add a note
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What was said, and what we agreed."
          className="mt-2 w-full rounded-xl border border-ink-700 bg-ink-950 p-2.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-violet-500/60 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {(["GENERAL", "COMPLAINT", "WARNING"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={saving || !note.trim()}
              onClick={() => run({ action: "note", body: note, kind }, () => setNote(""))}
              className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-mist-300 hover:text-mist-100 disabled:opacity-40"
            >
              Save as {kind.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gold-400/35 bg-gold-400/[0.04] p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-300">
          <Gift className="h-3.5 w-3.5" /> Put something right
        </p>
        <p className="mt-1 text-xs text-mist-400">
          Credit lands on their next order. Up to {GOODWILL_MAX_XAF} XAF here — anything larger is the owner&apos;s
          call, and that friction is deliberate.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="XAF"
            className="w-24 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-sm tabular-nums text-mist-100 placeholder:text-mist-600 focus:border-gold-400/60 focus:outline-none"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What is this for?"
            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-gold-400/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={saving || !amount || !reason.trim()}
            onClick={() =>
              run({ action: "goodwill", amountXaf: Number(amount), reason }, () => {
                setAmount("");
                setReason("");
              })
            }
            className="rounded-lg bg-gold-400 px-3 py-1.5 text-xs font-bold text-ink-950 disabled:opacity-40"
          >
            Credit
          </button>
        </div>
      </div>

      {canBlock && (
        <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
            <ShieldAlert className="h-3.5 w-3.5" /> Do-not-serve list
          </p>
          {c.blockedAt ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => run({ action: "unblock" })}
              className="mt-2 rounded-lg border border-safe/40 px-3 py-1.5 text-xs font-semibold text-safe hover:bg-safe/10 disabled:opacity-40"
            >
              Take them off the list
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? A block with no reason cannot be reviewed."
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-sm text-mist-100 placeholder:text-mist-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={saving || !reason.trim()}
                onClick={() => run({ action: "block", reason }, () => setReason(""))}
                className="rounded-lg border border-restricted/50 px-3 py-1.5 text-xs font-semibold text-restricted hover:bg-restricted/10 disabled:opacity-40"
              >
                Block
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-xl border border-restricted/40 bg-restricted/[0.06] p-3 text-xs text-restricted">{error}</p>}

      {c.legacyNote && (
        <p className="rounded-xl border border-ink-800 bg-ink-950/60 p-3 text-xs text-mist-400">
          <span className="font-semibold text-mist-300">Older note: </span>
          {c.legacyNote}
        </p>
      )}

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-semibold text-mist-200">
          <Clock className="h-4 w-4" /> Everything, in order
        </h3>
        <ol className="flex flex-col gap-1.5">
          {timeline.map((e, i) => (
            <li
              key={`${e.kind}-${e.at}-${i}`}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2",
                e.tone === "BAD" && "border-restricted/30 bg-restricted/[0.04]",
                e.tone === "GOOD" && "border-safe/25 bg-safe/[0.03]",
                e.tone === "NEUTRAL" && "border-ink-800 bg-ink-900"
              )}
            >
              <span className="mt-0.5 shrink-0 text-mist-500">
                {e.kind === "ORDER" ? (
                  <Package className="h-3.5 w-3.5" />
                ) : e.kind === "CASE" ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : e.kind === "CREDIT" ? (
                  <Coins className="h-3.5 w-3.5" />
                ) : (
                  <StickyNote className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-mist-200">
                  {e.href ? (
                    <Link href={e.href} className="hover:underline">
                      {e.title}
                    </Link>
                  ) : (
                    e.title
                  )}
                  <span className="text-[10px] tabular-nums text-mist-600">
                    {new Date(e.at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
                {e.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-mist-500">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function TagEditor({
  tags,
  saving,
  onSave,
}: {
  tags: string[];
  saving: boolean;
  onSave: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const toggle = (t: string) => onSave(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
        <Tag className="h-3.5 w-3.5" /> Tags
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...new Set([...SUGGESTED_TAGS, ...tags])].map((t) => (
          <button
            key={t}
            type="button"
            disabled={saving}
            onClick={() => toggle(t)}
            className={cn(
              "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
              tags.includes(t)
                ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                : "border-ink-700 text-mist-500 hover:text-mist-300"
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={24}
          placeholder="Add your own"
          className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-xs text-mist-100 placeholder:text-mist-600 focus:outline-none"
        />
        <button
          type="button"
          disabled={saving || !draft.trim() || tags.includes(draft.trim())}
          onClick={() => {
            onSave([...tags, draft.trim()]);
            setDraft("");
          }}
          className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-semibold text-mist-300 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function TierChip({ tier }: { tier: CustomerTier }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tier === "VIP" && "bg-gold-400/20 text-gold-300",
        tier === "REGULAR" && "bg-violet-500/20 text-violet-300",
        tier === "RETURNING" && "bg-ink-800 text-mist-400",
        tier === "NEW" && "bg-safe/15 text-safe"
      )}
    >
      {tier === "VIP" && <Star className="h-2.5 w-2.5" />}
      {TIER_LABEL[tier]}
    </span>
  );
}

function RiskChip({ risk }: { risk: CustomerRisk }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        risk === "BLOCKED" || risk === "AT_RISK" ? "bg-restricted/20 text-restricted" : "bg-caution/20 text-caution"
      )}
    >
      {RISK_LABEL[risk]}
    </span>
  );
}

function Stat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "bad" }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900 px-3 py-2">
      <p className={cn("font-display text-base font-bold tabular-nums", tone === "bad" ? "text-restricted" : "text-mist-100")}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-mist-500">{label}</p>
    </div>
  );
}
