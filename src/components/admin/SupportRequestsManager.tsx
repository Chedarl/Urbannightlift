"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Inbox } from "lucide-react";
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

  async function setStatus(id: string, status: SupportStatus) {
    const res = await fetch(`/api/support/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) startTransition(() => router.refresh());
  }

  const newCount = requests.filter((r) => r.status === "NEW").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Support requests</h1>
        {newCount > 0 && <Badge tone="caution">{newCount} new</Badge>}
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
                {r.orderCode && <span className="text-xs text-gold-300">{r.orderCode}</span>}
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

            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ink-800 p-3 text-sm leading-relaxed text-mist-300">
              {r.message}
            </p>

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
