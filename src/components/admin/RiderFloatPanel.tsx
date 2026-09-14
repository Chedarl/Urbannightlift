"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, ChevronDown } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { formatXaf } from "@/lib/utils";

/**
 * Handing a rider company cash, and taking it back.
 *
 * The float engine and its proof have existed for a while; this is the screen
 * that was missing, and without it there was no way to grant a float at all —
 * which meant no rider could be sent on a food or pharmacy job, because the
 * goods endpoint correctly refuses to let anyone shop with their own money.
 *
 * Collapsed by default and loaded on demand: an owner opening the users page to
 * suspend an account should not trigger a ledger read for every rider on it.
 */

interface FloatState {
  limitXaf: number;
  suspended: boolean;
  balanceXaf: number;
  advancedXaf: number;
  spendableXaf: number;
  headroomXaf: number;
  entries: { id: string; amountXaf: number; type: string; note: string | null; createdAt: string }[];
}

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Cash handed over",
  RETURN: "Cash handed back",
  ADJUSTMENT: "Correction",
};

export function RiderFloatPanel({ riderId, riderName }: { riderId: string; riderName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FloatState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState("");
  const [amount, setAmount] = useState("");

  async function load() {
    setError(null);
    const res = await fetch(`/api/admin/riders/${riderId}/float`);
    if (!res.ok) {
      setError("Couldn't read this rider's float.");
      return;
    }
    const data = (await res.json()) as FloatState;
    setState(data);
    setLimit(String(data.limitXaf || ""));
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !state) await load();
  }

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/riders/${riderId}/float`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "That didn't work.");
        return;
      }
      setAmount("");
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-medium text-mist-400 hover:text-mist-200"
      >
        <Wallet className="h-3.5 w-3.5" />
        Float
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-ink-700 bg-ink-950 p-3">
          {!state ? (
            <p className="text-xs text-mist-500">Reading the ledger…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Figure label="Limit" value={state.limitXaf} />
                {/* What we advanced, what is at a counter, what is left to spend.
                    Three numbers because the middle one is the one people forget. */}
                <Figure label="Holding" value={state.balanceXaf} />
                <Figure label="Spent, unsettled" value={state.advancedXaf} />
                <Figure label="Left to spend" value={state.spendableXaf} tone="gold" />
              </div>

              {state.limitXaf <= 0 && (
                <p className="mt-2 text-xs leading-relaxed text-caution">
                  No float. {riderName.split(" ")[0]} cannot take food, pharmacy or grocery jobs
                  until you grant one — the app will refuse to let them pay from their own pocket.
                </p>
              )}
              {state.suspended && (
                <p className="mt-2 text-xs text-caution">
                  Suspended — no new top-ups. They can still hand cash back.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="w-28 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
                  inputMode="numeric"
                  placeholder="Limit"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act({ action: "grant", limitXaf: Number(limit || 0) })}
                >
                  Set limit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act({ action: state.suspended ? "resume" : "suspend" })}
                >
                  {state.suspended ? "Resume" : "Suspend"}
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="w-28 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
                  inputMode="numeric"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                />
                <Button
                  size="sm"
                  disabled={busy || !amount}
                  onClick={() => act({ action: "topup", amountXaf: Number(amount) })}
                >
                  Hand over
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !amount}
                  onClick={() => act({ action: "return", amountXaf: Number(amount) })}
                >
                  Take back
                </Button>
              </div>

              {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

              {state.entries.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-ink-800 pt-2">
                  {state.entries.slice(0, 6).map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-mist-500">
                        {TYPE_LABEL[e.type] ?? e.type}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums ${e.amountXaf < 0 ? "text-safe" : "text-mist-300"}`}
                      >
                        {e.amountXaf > 0 ? "+" : ""}
                        {formatXaf(e.amountXaf)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: "gold" }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-mist-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone === "gold" ? "text-gold-400" : "text-mist-200"}`}>
        {formatXaf(value)}
      </p>
    </div>
  );
}
