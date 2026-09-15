"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { formatXaf } from "@/lib/utils";
import { Button } from "@/components/shared/Button";

/**
 * "We've accepted your order — here's the price. Do you agree?"
 *
 * The customer previously had no way to learn their order had been accepted or
 * what it would cost; the number appeared on the page only if they happened to
 * refresh. Worse, they were never asked to agree to it, so a price could move
 * between ordering and delivery and they would first find out at the door —
 * where refusing costs us the whole trip.
 */
export function QuoteCard({
  orderCode,
  feeXaf,
  note,
  accepted,
  declined,
  fr,
}: {
  orderCode: string;
  feeXaf: number;
  note: string | null;
  accepted: boolean;
  declined: boolean;
  fr: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${orderCode}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, reason: accept ? undefined : reason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? (fr ? "Une erreur s'est produite." : "Something went wrong."));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (accepted) {
    return (
      <div className="rounded-2xl border border-safe/30 bg-safe/10 p-4 text-sm text-safe">
        <p className="font-semibold">
          {fr ? `Prix accepté : ${formatXaf(feeXaf)}` : `Price accepted — ${formatXaf(feeXaf)}`}
        </p>
        <p className="mt-1 text-xs opacity-90">
          {fr
            ? "Nous assignons un livreur. Vous pouvez maintenant régler la livraison."
            : "We're assigning a rider. You can pay for the delivery now."}
        </p>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4 text-sm text-mist-300">
        {fr
          ? "Vous avez refusé ce prix et la commande a été annulée. Écrivez-nous si vous changez d'avis."
          : "You declined this price and the order was cancelled. Message us if you change your mind."}
      </div>
    );
  }

  return (
    /*
      Gold comes off the surface and stays on the number.

      This was gold text on a gold ground, so the heading, the ground and the
      fee all said "money" equally and the fee — the only one that is money —
      had nothing left to distinguish it. The card is now a plain raised
      surface and `formatXaf` below is the single gold thing on it.
    */
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <p className="font-display text-base font-bold text-mist-100">
        {fr ? "Votre commande est acceptée" : "Your order has been accepted"}
      </p>
      <p className="mt-1 text-sm text-mist-200">
        {fr ? "Frais de livraison : " : "Delivery fee: "}
        <span className="font-display text-xl font-bold text-gold-300">{formatXaf(feeXaf)}</span>
      </p>
      {note && <p className="mt-2 rounded-xl bg-ink-900/60 p-2 text-xs text-mist-300">{note}</p>}
      <p className="mt-2 text-xs text-mist-400">
        {fr
          ? "Confirmez ce prix et nous assignons un livreur immédiatement. Aucun livreur n'est envoyé avant votre accord."
          : "Confirm this price and we'll assign a rider straight away. No rider is sent before you agree."}
      </p>

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      {showDecline ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            className="w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm"
            placeholder={fr ? "Pourquoi refusez-vous ? (facultatif)" : "Why are you declining? (optional)"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => answer(false)}>
              {fr ? "Confirmer le refus" : "Confirm decline"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowDecline(false)}>
              {fr ? "Retour" : "Back"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => answer(true)}>
            <Check className="h-4 w-4" /> {fr ? "J'accepte ce prix" : "Accept this price"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowDecline(true)}>
            <X className="h-4 w-4" /> {fr ? "Refuser" : "Decline"}
          </Button>
        </div>
      )}
    </div>
  );
}
