"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Loader2, Check } from "lucide-react";

/**
 * The people who joined and have not heard from us yet.
 *
 * A welcome that relies on somebody remembering is a welcome that stops
 * happening in week two. This is the list instead: oldest first, because the
 * person who signed up four nights ago and got nothing is the one the silence
 * has cost most, and one tap each.
 *
 * The tap opens WhatsApp with the message and their card link already typed —
 * a `wa.me` link cannot send by itself and cannot carry a file, which is why
 * the card travels as a link and why a human is still in the loop. When the
 * Meta Cloud API is switched on (`WHATSAPP_PROVIDER=cloud`) this queue simply
 * stops filling up, because signup sends it.
 */

interface Row {
  id: string;
  name: string;
  phone: string | null;
  joinedAt: string;
  verified?: boolean;
}

export function WelcomeQueue({ kind }: { kind: "customer" | "merchant" }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/welcome", { cache: "no-store" });
      if (!res.ok) return setRows([]);
      const data = await res.json();
      setRows(kind === "customer" ? data.customers : data.merchants);
    } catch {
      setRows([]);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(row: Row) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: row.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't prepare the welcome.");
        return;
      }

      // Opened rather than navigated: losing the admin screen mid-queue would
      // mean finding your place again after every single send.
      if (data.link) window.open(data.link, "_blank", "noopener");
      setDone((d) => new Set(d).add(row.id));
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  // Nothing waiting is the normal state, and an empty box every night is noise.
  if (!rows || rows.length === 0) return null;

  const waiting = rows.filter((r) => !done.has(r.id));

  return (
    <section className="rounded-2xl border border-gold-400/30 bg-gold-400/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gold-300">
        <MessageCircle className="h-4 w-4" />
        {waiting.length} {kind === "customer" ? "new" : "new business"}
        {waiting.length === 1 ? "" : "es"} to welcome
      </h2>
      <p className="mt-1 text-xs text-mist-500">
        Opens WhatsApp with the message and their welcome card already written. Oldest first.
      </p>

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => {
          const sent = done.has(row.id);
          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-950 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-mist-100">{row.name}</p>
                <p className="text-xs text-mist-500">
                  {row.phone ?? "no WhatsApp number"} ·{" "}
                  {new Date(row.joinedAt).toLocaleDateString()}
                  {row.verified === false ? " · not yet verified" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => send(row)}
                disabled={busy === row.id || !row.phone}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                  sent
                    ? "border border-safe/40 bg-safe/10 text-safe"
                    : "border border-violet-500/40 bg-violet-600/20 text-violet-200"
                }`}
              >
                {busy === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : sent ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                {sent ? "Sent" : "Send welcome"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
