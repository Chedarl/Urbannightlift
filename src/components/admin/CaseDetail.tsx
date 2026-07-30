"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X,
  Phone,
  MessageCircle,
  Send,
  Lock,
  Star,
  ShieldAlert,
  Gift,
  Package,
  Loader2,
  ChevronDown,
  Check,
} from "lucide-react";
import { buildWaLink } from "@/lib/whatsapp/links";
import { cn } from "@/lib/utils";
import type { CasePriority, CaseStatus, SlaState } from "@/lib/support/sla";
import { TIER_LABEL, RISK_LABEL, type CustomerTier, type CustomerRisk } from "@/lib/customers/health";

/**
 * One case, worked to a close without leaving it.
 *
 * The thread the customer sees, a private lane for staff notes, the reply box
 * with saved answers, the status and priority controls, and — the point of a
 * solution-oriented desk — the actions that actually fix things: reach the
 * customer, open the order where dispatch lives, or put credit right. Who they
 * are to the business sits alongside, so the answer is sized to the person.
 */

interface CaseMsg {
  id: string;
  body: string;
  authorType: string;
  authorName: string;
  internal: boolean;
  createdAt: string;
}

interface CaseCustomer {
  id: string;
  fullName: string;
  whatsappNumber: string;
  tags: string[];
  creditXaf: number;
  delivered: number;
  tier: CustomerTier;
  risk: CustomerRisk;
  summary: string;
}

interface CaseFull {
  case: {
    id: string;
    who: string;
    whatsappNumber: string | null;
    email: string | null;
    category: string;
    source: string;
    priority: CasePriority;
    status: CaseStatus;
    message: string;
    createdAt: string;
    assignedToUserId: string | null;
    waited: number | null;
    sla: SlaState;
    targetMin: number;
  };
  order: { id: string; orderCode: string; orderStatus: string; serviceType: string } | null;
  customer: CaseCustomer | null;
  messages: CaseMsg[];
}

interface Macro {
  id: string;
  title: string;
  body: string;
}

const STATUS_LABEL: Record<CaseStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function CaseDetail({
  caseId,
  staff,
  onClose,
  onChanged,
}: {
  caseId: string;
  staff: { id: string; fullName: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<CaseFull | null>(null);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goodwill, setGoodwill] = useState("");
  const threadEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cases/${caseId}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* keep what's on screen */
    }
  }, [caseId]);

  useEffect(() => {
    load();
    fetch("/api/admin/canned-replies", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((d) => setMacros(d.replies ?? []))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "nearest" });
  }, [data?.messages.length]);

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${caseId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply, internal }),
      });
      if (!res.ok) {
        setError("Couldn't send. Try again.");
        return;
      }
      setReply("");
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("That didn't work.");
        return;
      }
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function credit() {
    const amount = Number(goodwill);
    if (!data?.customer || !amount) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/${data.customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "goodwill", amountXaf: amount, reason: `Case ${caseId.slice(-6)}` }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Couldn't credit.");
        return;
      }
      setGoodwill("");
      // Leave a trace on the case timeline that we made it right.
      await fetch(`/api/support/${caseId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Credited ${amount} XAF to the customer.`, internal: true }),
      }).catch(() => {});
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-ink-800 bg-ink-900 p-10 text-sm text-mist-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening…
      </div>
    );
  }

  const c = data.case;
  const wa = c.whatsappNumber?.replace(/\D/g, "") ?? "";

  return (
    <div className="flex flex-col gap-4">
      {/* Header: who, how long they have waited, and the way out */}
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold text-mist-100">{c.who}</h2>
            <PriorityChip priority={c.priority} />
            {c.sla === "BREACHED" && (
              <span className="rounded bg-restricted/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-restricted">
                Overdue{c.waited != null ? ` · ${c.waited}m` : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-mist-500">
            {c.category.replace(/_/g, " ").toLowerCase()} · {c.source.replace(/_/g, " ").toLowerCase()} ·{" "}
            {STATUS_LABEL[c.status]}
          </p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg border border-ink-700 p-1.5 text-mist-500 hover:text-mist-200">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        {/* ── The conversation ── */}
        <div className="flex flex-col gap-3">
          <div className="flex max-h-[24rem] flex-col gap-2 overflow-y-auto rounded-2xl border border-ink-800 bg-ink-950/40 p-3">
            <div className="rounded-xl bg-ink-900 p-3 text-sm text-mist-200">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-mist-500">
                {new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              {c.message}
            </div>
            {data.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-xl p-2.5 text-sm",
                  m.internal
                    ? "self-center border border-dashed border-caution/40 bg-caution/[0.06] text-caution"
                    : m.authorType === "STAFF"
                      ? "self-end bg-violet-500/15 text-mist-100"
                      : "self-start bg-ink-800 text-mist-200"
                )}
              >
                <p className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist-500">
                  {m.internal && <Lock className="h-2.5 w-2.5" />}
                  {m.internal ? "internal" : m.authorName} ·{" "}
                  {new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {m.body}
              </div>
            ))}
            <div ref={threadEnd} />
          </div>

          {/* Reply box with macros */}
          <div className="rounded-2xl border border-ink-800 bg-ink-900 p-3">
            {macros.length > 0 && !internal && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {macros.map((mac) => (
                  <button
                    key={mac.id}
                    type="button"
                    onClick={() => {
                      setReply(mac.body);
                      fetch("/api/admin/canned-replies", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: mac.id }),
                      }).catch(() => {});
                    }}
                    className="shrink-0 rounded-lg border border-ink-700 px-2 py-1 text-[11px] text-mist-400 hover:text-mist-200"
                  >
                    {mac.title}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder={internal ? "A note for the team (the customer never sees this)…" : "Reply to the customer…"}
              className="w-full rounded-xl border border-ink-700 bg-ink-950 p-2.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-violet-500/60 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-mist-400">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-3.5 w-3.5 accent-caution" />
                Internal note
              </label>
              <button
                type="button"
                onClick={sendReply}
                disabled={busy || !reply.trim()}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40",
                  internal ? "bg-caution text-ink-950" : "bg-violet-500 text-white"
                )}
              >
                <Send className="h-3.5 w-3.5" /> {internal ? "Save note" : "Send reply"}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-restricted">{error}</p>}
        </div>

        {/* ── Side panel: who they are, and how to fix it ── */}
        <div className="flex flex-col gap-3">
          {/* Reach them */}
          {wa && (
            <div className="flex gap-2">
              <a href={`tel:+${wa}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-700 py-2 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe">
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
              <a href={buildWaLink(wa, `Urban Night Lift — about your message, ${c.who.split(" ")[0]}.`)} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-700 py-2 text-xs font-semibold text-mist-300 hover:border-safe/50 hover:text-safe">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </div>
          )}

          {/* Who they are */}
          {data.customer && (
            <div className="rounded-2xl border border-ink-800 bg-ink-900 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <TierChip tier={data.customer.tier} />
                {data.customer.risk !== "NONE" && <RiskChip risk={data.customer.risk} />}
              </div>
              <p className="mt-1.5 text-xs text-mist-400">{data.customer.summary}</p>
              <Link href={`/admin/live`} className="mt-2 inline-block text-[11px] text-violet-300 hover:text-violet-200">
                Open full profile →
              </Link>
            </div>
          )}

          {/* The order this is about — where dispatch actions live, audited */}
          {data.order && (
            <Link
              href={`/admin/orders/${data.order.id}`}
              className="flex items-center gap-2 rounded-2xl border border-ink-800 bg-ink-900 p-3 hover:border-violet-500/50"
            >
              <Package className="h-4 w-4 text-mist-400" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs font-semibold text-gold-300">{data.order.orderCode}</span>
                <span className="block text-[11px] text-mist-500">
                  {data.order.orderStatus.replace(/_/g, " ").toLowerCase()} — re-price, re-dispatch, refund
                </span>
              </span>
              <ChevronDown className="h-4 w-4 -rotate-90 text-mist-600" />
            </Link>
          )}

          {/* Put it right */}
          {data.customer && (
            <div className="rounded-2xl border border-gold-400/30 bg-gold-400/[0.04] p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-300">
                <Gift className="h-3.5 w-3.5" /> Make it right
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={goodwill}
                  onChange={(e) => setGoodwill(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="XAF"
                  className="w-20 rounded-lg border border-ink-700 bg-ink-950 px-2 py-1.5 text-sm tabular-nums text-mist-100 placeholder:text-mist-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={credit}
                  disabled={busy || !goodwill}
                  className="flex-1 rounded-lg bg-gold-400 px-2 py-1.5 text-xs font-bold text-ink-950 disabled:opacity-40"
                >
                  Credit
                </button>
              </div>
              <p className="mt-1 text-[10px] text-mist-500">{data.customer.creditXaf} XAF unspent now</p>
            </div>
          )}

          {/* Move it along */}
          <div className="rounded-2xl border border-ink-800 bg-ink-900 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mist-500">Priority</p>
            <div className="grid grid-cols-4 gap-1">
              {(["LOW", "NORMAL", "HIGH", "URGENT"] as CasePriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ priority: p })}
                  className={cn(
                    "rounded-lg py-1 text-[10px] font-bold uppercase",
                    c.priority === p ? "bg-violet-500 text-white" : "border border-ink-700 text-mist-400"
                  )}
                >
                  {p[0]}
                </button>
              ))}
            </div>
            <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-mist-500">Assign</p>
            <select
              value={c.assignedToUserId ?? ""}
              onChange={(e) => patch({ assignedToUserId: e.target.value })}
              className="w-full rounded-lg border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs text-mist-200 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-col gap-1.5">
              {c.status !== "WAITING_ON_CUSTOMER" && (
                <button type="button" onClick={() => patch({ status: "WAITING_ON_CUSTOMER" })} className="rounded-lg border border-ink-700 py-1.5 text-xs text-mist-300 hover:text-mist-100">
                  Waiting on customer
                </button>
              )}
              {c.status !== "RESOLVED" && c.status !== "CLOSED" ? (
                <button type="button" onClick={() => patch({ status: "RESOLVED" })} className="flex items-center justify-center gap-1.5 rounded-lg bg-safe py-2 text-xs font-bold text-ink-950">
                  <Check className="h-3.5 w-3.5" /> Mark resolved
                </button>
              ) : (
                <button type="button" onClick={() => patch({ status: "IN_PROGRESS" })} className="rounded-lg border border-ink-700 py-1.5 text-xs text-mist-300 hover:text-mist-100">
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriorityChip({ priority }: { priority: CasePriority }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        priority === "URGENT" && "bg-restricted/20 text-restricted",
        priority === "HIGH" && "bg-caution/20 text-caution",
        priority === "NORMAL" && "bg-ink-800 text-mist-400",
        priority === "LOW" && "bg-ink-800 text-mist-500"
      )}
    >
      {priority}
    </span>
  );
}

function TierChip({ tier }: { tier: CustomerTier }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tier === "VIP" ? "bg-gold-400/20 text-gold-300" : tier === "REGULAR" ? "bg-violet-500/20 text-violet-300" : "bg-ink-800 text-mist-400"
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
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        risk === "BLOCKED" || risk === "AT_RISK" ? "bg-restricted/20 text-restricted" : "bg-caution/20 text-caution"
      )}
    >
      <ShieldAlert className="h-2.5 w-2.5" /> {RISK_LABEL[risk]}
    </span>
  );
}
