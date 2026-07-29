"use client";

import { useState } from "react";
import { Shield, Share2, Copy, Check, MessageCircle } from "lucide-react";
import { buildWaLink } from "@/lib/whatsapp/links";

/**
 * "Let someone know I'm getting this delivered."
 *
 * This is the differentiator nobody else in this market has bothered with. A
 * woman ordering alone at 1 AM does not want a better map — she wants one other
 * person to be able to see the rider coming and know when she is home.
 *
 * The link is deliberately safe to forward: it shows the rider moving, an ETA
 * and the status, and nothing else. No delivery code, no phone number, no
 * street address, no name. It stops working an hour after the delivery
 * finishes, so it cannot become a permanent window onto somebody's movements.
 */
export function ShareDelivery({ orderCode, fr }: { orderCode: string; fr: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/watch-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error && typeof data.error === "string" && data.error.length > 20
            ? data.error
            : fr
              ? "Impossible de créer le lien. Réessayez."
              : "Couldn't create the link. Try again."
        );
        return;
      }
      setUrl(data.url);

      // Where a phone offers its own share sheet, use it — one tap into
      // whichever app they actually talk to that person in.
      if (typeof navigator !== "undefined" && navigator.share) {
        navigator
          .share({
            title: fr ? "Suivez ma livraison" : "Watch my delivery",
            text: fr
              ? "Suivez ma livraison Urban Night Lift en direct."
              : "Follow my Urban Night Lift delivery live.",
            url: data.url,
          })
          .catch(() => {
            // Dismissed the sheet. The link is on screen either way.
          });
      }
    } catch {
      setError(fr ? "Impossible de créer le lien. Réessayez." : "Couldn't create the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(fr ? "Copiez le lien manuellement." : "Copy the link by hand.");
    }
  }

  return (
    <div className="rounded-2xl border border-violet-500/35 bg-violet-950/20 p-4">
      <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-violet-200">
        <Shield className="h-4 w-4" />
        {fr ? "Faites-vous suivre par quelqu'un de confiance" : "Let someone you trust watch"}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-mist-400">
        {fr
          ? "Envoyez un lien à une personne de confiance. Elle verra le livreur avancer et saura quand vous avez reçu votre commande — sans votre code, sans votre numéro, sans votre adresse exacte. Le lien s'éteint une heure après la livraison."
          : "Send a link to somebody you trust. They'll see the rider moving and know when you've got your delivery — without your code, your number, or your exact address. The link dies an hour after the delivery."}
      </p>

      {!url ? (
        <button
          type="button"
          onClick={mint}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          <Share2 className="h-4 w-4" />
          {busy
            ? fr
              ? "Création…"
              : "Creating…"
            : fr
              ? "Partager ma livraison"
              : "Share my delivery"}
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="truncate rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-[11px] text-mist-400">
            {url}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-700 px-3 py-2 text-xs font-semibold text-mist-300 hover:text-mist-100"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-safe" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? (fr ? "Copié" : "Copied") : fr ? "Copier" : "Copy"}
            </button>
            <a
              href={buildWaLink(
                "",
                fr
                  ? `Suivez ma livraison Urban Night Lift en direct : ${url}`
                  : `Follow my Urban Night Lift delivery live: ${url}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-safe/90 px-3 py-2 text-xs font-semibold text-ink-950 hover:bg-safe"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}
    </div>
  );
}
