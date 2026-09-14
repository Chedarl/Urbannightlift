"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Receipt } from "lucide-react";
import { formatXaf } from "@/lib/utils";

/**
 * The shop charged more than the customer allowed. This is us asking.
 *
 * The cap was a promise — we said we would not spend past it without checking.
 * Honouring that promise when it is inconvenient is the entire point: an
 * over-spend that appears silently on the bill is indistinguishable, from the
 * customer's side, from being cheated.
 *
 * So the overage is stated plainly, in its own words: what they allowed, what
 * the shop charged, the difference, and that nothing is owed until they say so.
 * Declining is a real option and does not cancel their order — the goods are
 * already bought, and dispatch picks it up from there. Making "decline" quietly
 * useless would be a worse lie than not asking at all.
 */
export function ApproveOverCap({
  orderCode,
  capXaf,
  actualXaf,
  overByXaf,
  fr,
  onAnswered,
}: {
  orderCode: string;
  capXaf: number;
  actualXaf: number;
  overByXaf: number;
  fr: boolean;
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<null | "approve" | "decline">(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(approve: boolean) {
    setBusy(approve ? "approve" : "decline");
    setError(null);
    try {
      const res = await fetch(`/api/track/${orderCode}/goods-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? (fr ? "Une erreur est survenue." : "Something went wrong."));
        return;
      }
      onAnswered();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-caution/50 bg-caution/[0.07] p-4">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-gold-200">
        <AlertTriangle className="h-4 w-4 text-caution" />
        {fr ? "Le commerçant a facturé plus que prévu" : "The shop charged more than expected"}
      </p>

      <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-ink-950/40 p-3">
        <Row label={fr ? "Votre plafond" : "Your cap"} value={formatXaf(capXaf)} />
        <Row label={fr ? "Prix du commerçant" : "The shop's price"} value={formatXaf(actualXaf)} />
        <div className="my-1 border-t border-ink-700" />
        <Row label={fr ? "Différence" : "Difference"} value={formatXaf(overByXaf)} strong />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-mist-300">
        {fr
          ? "Rien ne vous est facturé tant que vous n'avez pas accepté. Si vous refusez, votre commande n'est pas annulée — notre équipe vous rappelle pour trouver une solution."
          : "Nothing is charged to you until you agree. If you decline, your order isn't cancelled — our team will call you to sort it out."}
      </p>

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={busy != null}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gold-400 py-3 text-sm font-bold text-ink-950 disabled:opacity-60"
        >
          {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {fr ? "J'accepte" : "I agree"}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={busy != null}
          className="flex items-center justify-center gap-2 rounded-xl border border-ink-600 px-4 py-3 text-sm font-semibold text-mist-200 disabled:opacity-60"
        >
          {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {fr ? "Refuser" : "Decline"}
        </button>
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-xs text-mist-500">
        <Receipt className="mt-0.5 h-3 w-3 shrink-0" />
        {fr
          ? "Le livreur a photographié le reçu du commerçant — demandez-le à tout moment."
          : "The rider photographed the shop's receipt — ask for it any time."}
      </p>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-mist-400">{label}</span>
      <span className={strong ? "font-bold text-caution" : "font-medium text-mist-200"}>{value}</span>
    </div>
  );
}
