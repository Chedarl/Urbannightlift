"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";

import { saveDraft } from "@/lib/orders/draft";
import { useTranslation } from "@/lib/i18n";
import type { ServiceType } from "@prisma/client";

/**
 * One box, above the seven service tiles.
 *
 * Somebody who already knows what they want should not have to choose a
 * category first. *"Two pizzas from Dolcezza to my place in Bastos"* names the
 * service, the shop, the item and the destination — everything the first screen
 * of the form asks for — and typing it is faster than deciding whether pizza is
 * "food pickup" or "merchant delivery".
 *
 * ## What happens when they press it
 *
 * The sentence is read into the fields of a draft, and they land on **the same
 * form they would have filled anyway**, with the boxes already populated and
 * every one of them editable.
 *
 * Nothing is ordered. Nothing is priced. Nothing is sent. The form still asks
 * for the address, still computes the fee from the zone, still requires the
 * terms box — because the draft goes through `saveDraft`, which is the same
 * door "order this again" already uses, and the order itself is created by the
 * same endpoint with the same guards it has always had.
 *
 * That is the entire safety model: **this can only save typing.** The worst a
 * bad reading can do is put the wrong words in a box the customer is looking
 * at, on a screen built for editing them.
 *
 * ## And when it is not available
 *
 * With no key configured the box is not rendered at all — not a disabled input
 * with an explanation, which would be a worse first impression than the tiles
 * alone. The tiles are the way in, and they always have been.
 */
export function QuickIntake({ enabledServices }: { enabledServices: ServiceType[] }) {
  const router = useRouter();
  const { locale } = useTranslation();
  const fr = locale === "fr";

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    const sentence = text.trim();
    if (sentence.length < 4 || busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      });
      const data = await res.json();

      if (!res.ok || !data.draft) {
        setError(
          data.error ??
            (fr ? "Nous n'avons pas compris. Choisissez ci-dessous." : "We didn't catch that. Pick below.")
        );
        return;
      }

      const d = data.draft as {
        serviceType: ServiceType;
        itemDescription: string;
        pickupLocation: string;
        deliveryLocation: string;
        notes: string;
        quantity: number;
      };

      /*
       * A partial draft, on purpose.
       *
       * Only the fields they actually said are set. Everything else — the fee,
       * the zones, the payment method, the terms — is left for the form and the
       * customer, exactly as on any other route in. `estimatedFeeXaf: null`
       * matters: a price this has not computed must never be shown as though it
       * had been.
       */
      saveDraft({
        serviceType: d.serviceType,
        itemDescription: d.itemDescription,
        pickupLocation: d.pickupLocation,
        deliveryLocation: d.deliveryLocation,
        specialInstructions: d.notes,
        quantity: d.quantity,
        estimatedFeeXaf: null,
      } as never);

      router.push(`/order/new?service=${d.serviceType}&from=intake`);
    } catch {
      setError(fr ? "Connexion impossible. Réessayez." : "Couldn't connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (enabledServices.length === 0) return null;

  return (
    <div className="mb-5 rounded-2xl border border-violet-500/30 bg-violet-950/20 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-violet-200">
        <Sparkles className="h-4 w-4" />
        {fr ? "Dites-nous simplement ce qu'il vous faut" : "Just tell us what you need"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-mist-400">
        {fr
          ? "Une phrase suffit. Nous remplissons le formulaire — vous vérifiez avant d'envoyer."
          : "One sentence is enough. We fill the form in — you check it before anything is sent."}
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          placeholder={
            fr
              ? "« deux pizzas de chez Dolcezza pour Bastos »"
              : '"two pizzas from Dolcezza to Bastos"'
          }
          className="w-full bg-transparent text-sm text-mist-100 placeholder:text-mist-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={go}
          disabled={busy || text.trim().length < 4}
          className="shrink-0 text-violet-300 disabled:opacity-40"
          aria-label={fr ? "Continuer" : "Continue"}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] leading-relaxed text-caution">{error}</p>}
    </div>
  );
}
