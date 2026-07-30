"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Inbox as InboxIcon, RefreshCw, Package, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { CaseDetail } from "@/components/admin/CaseDetail";
import type { CasePriority, CaseStatus, SlaState } from "@/lib/support/sla";

/**
 * The one inbox: every case a human might answer, worst-first.
 *
 * Help-centre requests, threads raised on an order, incidents and cases a
 * dispatcher opened proactively all land here, sorted by how long the customer
 * has been waiting on us against what we promised. Opening one reveals the
 * whole conversation and everything needed to close it — no second screen.
 */

interface CaseRow {
  id: string;
  who: string;
  tags: string[];
  whatsappNumber: string | null;
  orderCode: string | null;
  category: string;
  source: string;
  priority: CasePriority;
  status: CaseStatus;
  preview: string;
  createdAt: string;
  assignedToName: string | null;
  waitingOnUs: boolean;
  waited: number | null;
  sla: SlaState;
  open: boolean;
}

interface Payload {
  staff: { id: string; fullName: string }[];
  counts: { waiting: number; breached: number; open: number };
  cases: CaseRow[];
}

const POLL_MS = 20_000;
type Filter = "waiting" | "open" | "all";

export function CaseInbox() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cases", { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 403 ? "Dispatch only." : "Couldn't refresh.");
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      setError("Couldn't refresh.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (openId && data) {
    return <CaseDetail caseId={openId} staff={data.staff} onClose={() => setOpenId(null)} onChanged={load} />;
  }

  if (!data) {
    return <p className="rounded-2xl border border-ink-800 bg-ink-900 p-6 text-sm text-mist-400">{error ?? "Loading the inbox…"}</p>;
  }

  const shown = data.cases.filter((c) =>
    filter === "waiting" ? c.waitingOnUs : filter === "open" ? c.open : true
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tally label="Waiting on us" value={data.counts.waiting} tone={data.counts.waiting > 0 ? "watch" : "calm"} />
        <Tally label="Overdue" value={data.counts.breached} tone={data.counts.breached > 0 ? "urgent" : "calm"} />
        <Tally label="Open" value={data.counts.open} tone="calm" />
        <button type="button" onClick={load} className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-mist-400 hover:text-mist-200">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="flex gap-1 rounded-xl border border-ink-800 bg-ink-950 p-1">
        {(["waiting", "open", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
              filter === f ? "bg-violet-500/15 text-violet-200" : "text-mist-500 hover:text-mist-300"
            )}
          >
            {f === "waiting" ? "Waiting on us" : f}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-2xl border border-ink-800 bg-ink-900 p-8 text-center text-sm text-mist-500">
          <InboxIcon className="h-6 w-6" />
          {filter === "waiting" ? "Nobody is waiting on us. Good." : "Nothing here."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left transition-colors",
                  c.sla === "BREACHED"
                    ? "border-restricted/50 bg-restricted/[0.05]"
                    : c.sla === "DUE_SOON"
                      ? "border-caution/40 bg-caution/[0.04]"
                      : "border-ink-800 bg-ink-900 hover:border-ink-600"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-mist-100">{c.who}</span>
                  <PriorityChip priority={c.priority} />
                  {!c.open && <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-mist-500">{c.status === "RESOLVED" ? "resolved" : "closed"}</span>}
                  {c.orderCode && (
                    <span className="flex items-center gap-1 text-[11px] text-mist-500">
                      <Package className="h-3 w-3" /> {c.orderCode}
                    </span>
                  )}
                  {c.waitingOnUs && c.waited != null && (
                    <span className={cn("ml-auto flex items-center gap-1 text-[11px]", c.sla === "BREACHED" ? "text-restricted" : "text-mist-400")}>
                      {c.sla === "BREACHED" ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {c.waited}m
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-mist-400">{c.preview}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-mist-600">
                  <span className="capitalize">{c.category.replace(/_/g, " ").toLowerCase()}</span>
                  <span>· {c.source.replace(/_/g, " ").toLowerCase()}</span>
                  {c.assignedToName && <span>· {c.assignedToName}</span>}
                  {c.tags.slice(0, 2).map((t) => (
                    <span key={t} className="flex items-center gap-0.5 rounded bg-ink-800 px-1 py-0.5 text-mist-400">
                      <Tag className="h-2.5 w-2.5" /> {t}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriorityChip({ priority }: { priority: CasePriority }) {
  if (priority === "NORMAL" || priority === "LOW") return null;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", priority === "URGENT" ? "bg-restricted/20 text-restricted" : "bg-caution/20 text-caution")}>
      {priority}
    </span>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: "urgent" | "watch" | "calm" }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", tone === "urgent" ? "border-restricted/50 bg-restricted/[0.07]" : tone === "watch" ? "border-caution/40 bg-caution/[0.05]" : "border-ink-800 bg-ink-900")}>
      <p className={cn("font-display text-xl font-bold tabular-nums", tone === "urgent" ? "text-restricted" : tone === "watch" ? "text-caution" : "text-mist-200")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-mist-500">{label}</p>
    </div>
  );
}
