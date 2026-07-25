"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

/**
 * Shown on the tracking/confirmation screen when the visitor hasn't proved they
 * own the order. Confirming the WhatsApp number used on the order unlocks the
 * delivery code and personal details — an order code alone is not a credential.
 */
export function VerifyOrderCard({ orderCode, maskedPhone }: { orderCode: string; maskedPhone: string }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const fr = locale === "fr";
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function verify() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCode, whatsappNumber: phone }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-500/40 bg-violet-950/30 p-4">
      <div className="flex items-start gap-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
        <div>
          <h2 className="font-display text-sm font-semibold text-mist-100">
            {fr ? "Confirmez que c'est bien vous" : "Confirm it's you"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-mist-400">
            {fr
              ? `Pour protéger votre commande, entrez le numéro WhatsApp utilisé lors de la commande (…${maskedPhone.slice(-2)}) pour voir votre code de livraison et vos coordonnées.`
              : `To protect your order, enter the WhatsApp number used to place it (…${maskedPhone.slice(-2)}) to see your delivery code and details.`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <input
          className={inputCls}
          inputMode="tel"
          autoComplete="tel"
          placeholder="+237 6XX XXX XXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        {error && (
          <p className="text-xs text-restricted">
            {fr
              ? "Ce numéro ne correspond pas à cette commande."
              : "That number doesn't match this order."}
          </p>
        )}
        <Button size="md" disabled={pending || phone.trim().length < 8} onClick={verify}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? t("auth.signingIn") : fr ? "Voir ma commande" : "View my order"}
        </Button>
      </div>
    </div>
  );
}
