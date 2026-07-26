"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Inbox, Send, Lock } from "lucide-react";
import { Badge } from "@/components/shared/Badge";
import { buildWaLink } from "@/lib/whatsapp/links";
import { normalizePhone } from "@/lib/utils";
import type { SupportCategory, SupportStatus } from "@prisma/client";

export interface SupportRequestItem {
  id: string;
  fullName: string;
  whatsappNumber: string | null;
  email: string | null;
  orderCode: string | null;
  category: SupportCategory;
  message: string;
  status: SupportStatus;
  createdAt: string;
  orderId: string | null;
  assignedToName: string | null;
  /** Set when the customer spoke last — i.e. nobody has answered them. */
  waitingOnUs: boolean;
  messages: { body: string; authorType: string; authorName: string; internal: boolean; createdAt: string }[];
}

const STATUSES: SupportStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED"];

const statusTone: Record<SupportStatus, "caution" | "violet" | "safe"> = {
  NEW: "caution",
  IN_PROGRESS: "violet",
  RESOLVED: "safe",
};

const selectCls =
  "rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-mist-100 focus:border-violet-500 focus:outline-none";

/**
 * Dispatch view for Help Centre submissions. Until now support requests were
 * only ever written to the database and never read anywhere, so every message a
 * customer sent through /help was silently lost.
 */
export function SupportRequestsManager({ requests }: { requests: SupportRequestItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function setStatus(id: string, status: SupportStatus) {
    const res = await fetch(`/api/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  async function reply(id: string, internal: boolean) {
    const body = (drafts[id] ?? "").trim();
    if (!body) return;
    const res = await fetch(`/api/support/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, internal }),
    });
    if (res.ok) {
      setDrafts((d) => ({ ...d, [id]: "" }));
      startTransition(() => router.refresh());
    }
  }

  const newCount = requests.filter((r) => r.status === "NEW").length;
  const waitingCount = requests.filter((r) => r.waitingOnUs).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Support requests</h1>
        <div className="flex items-center gap-2">
          {waitingCount > 0 && <Badge tone="caution">{waitingCount} waiting on us</Badge>}
          {newCount > 0 && <Badge tone="violet">{newCount} new</Badge>}
        </div>
      </div>

      {requests.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center">
          <Inbox className="h-6 w-6 text-mist-500" />
          <p className="text-sm text-mist-400">No support requests yet.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {requests.map((r) => (
          <article key={r.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-mist-100">{r.fullName}</span>
                <Badge tone="violet">{r.category.replaceAll("_", " ")}</Badge>
                <Badge tone={statusTone[r.status]}>{r.status.replaceAll("_", " ")}</Badge>
                {r.orderId ? (
                  <a href={`/admin/orders/${r.orderId}`} className="text-xs text-gold-300 underline">
                    {r.orderCode}
                  </a>
                ) : (
                  r.orderCode && <span className="text-xs text-gold-300">{r.orderCode}</span>
                )}
                {r.waitingOnUs && <Badge tone="caution">Waiting on us</Badge>}
                {r.assignedToName && <span className="text-xs text-mist-500">{r.assignedToName}</span>}
              </div>
              <span className="text-xs text-mist-500">
                {new Date(r.createdAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {/* Defensive: a request stored before the thread existed (or by any
                  path that forgot to write one) still has its text in the
                  message column. Never leave support looking at a blank card. */}
              {r.messages.length === 0 && r.message && (
                <div className="self-start max-w-[85%] rounded-xl bg-ink-800 p-2.5 text-sm text-mist-300">
                  <p className="text-[11px] text-mist-500">{r.fullName}</p>
                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{r.message}</p>
                </div>
              )}
              {r.messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.internal
                      ? "self-end max-w-[85%] rounded-xl border border-dashed border-ink-600 bg-ink-950 p-2.5 text-sm text-mist-400"
                      : m.authorType === "STAFF"
                        ? "self-end max-w-[85%] rounded-xl bg-violet-950/60 p-2.5 text-sm text-mist-200"
                        : "self-start max-w-[85%] rounded-xl bg-ink-800 p-2.5 text-sm text-mist-300"
                  }
                >
                  <p className="text-[11px] text-mist-500">
                    {m.internal && <Lock className="mr-1 inline h-3 w-3" />}
                    {m.authorName}
                    {m.internal ? " · internal note" : ""}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <textarea
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm"
                rows={2}
                placeholder="Reply to the customer, or keep a private note…"
                value={drafts[r.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || !(drafts[r.id] ?? "").trim()}
                  onClick={() => reply(r.id, false)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Reply to customer
                </button>
                <button
                  type="button"
                  disabled={pending || !(drafts[r.id] ?? "").trim()}
                  onClick={() => reply(r.id, true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-mist-300 disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" /> Internal note
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {r.whatsappNumber && (
                <a
                  href={buildWaLink(
                    normalizePhone(r.whatsappNumber),
                    `Urban Night Lift support${r.orderCode ? ` — ${r.orderCode}` : ""}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-ink-950"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> {r.whatsappNumber}
                </a>
              )}
              {r.email && (
                <a
                  href={`mailto:${r.email}?subject=${encodeURIComponent(
                    `Urban Night Lift support${r.orderCode ? ` — ${r.orderCode}` : ""}`
                  )}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs text-mist-200"
                >
                  <Mail className="h-3.5 w-3.5" /> {r.email}
                </a>
              )}
              <select
                className={selectCls}
                value={r.status}
                disabled={pending}
                onChange={(e) => setStatus(r.id, e.target.value as SupportStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
