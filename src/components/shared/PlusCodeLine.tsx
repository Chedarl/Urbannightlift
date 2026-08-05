"use client";

import { useState } from "react";
import { Copy, Check, MapPin } from "lucide-react";

import { encodePlusCode } from "@/lib/locations/plusCode";
import { useTranslation } from "@/lib/i18n";

/**
 * The address a place has when it has no address.
 *
 * Yaoundé addresses are landmarks — "behind the Total station at Rond-Point
 * Express, blue gate" — and most compounds have no street number, in many cases
 * no named street. That is the whole reason this product's address stack is
 * built the way it is.
 *
 * A **Plus Code** (Open Location Code) is the one standard that was designed for
 * exactly that situation: it turns a point into ten characters that name a 3×3
 * metre square, works with no account and no network, and — the part that
 * matters here — **can be read down a phone**. A rider who cannot find a gate
 * can be given ten characters and paste them into any map app.
 *
 * `encodePlusCode` has been in this codebase since v22, `ServiceLocation` has a
 * `plusCode` column, and every `SelectedLocation` carries one. **None of it has
 * ever been shown to anybody.** This is that, displayed.
 *
 * Derived from the coordinates at render time rather than stored, so it is
 * always consistent with the pin and needs no migration.
 */
export function PlusCodeLine({
  lat,
  lng,
  label,
}: {
  lat: number | null;
  lng: number | null;
  label?: string;
}) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [copied, setCopied] = useState(false);

  // No pin, no code. A Plus Code for a guessed point would be precise about
  // somewhere nobody chose, which is worse than having none.
  if (lat == null || lng == null) return null;
  const code = encodePlusCode(lat, lng);
  if (!code) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Older Android WebViews refuse the clipboard without a gesture chain.
      // A prompt is ugly and always works, which is the right trade at 1 AM.
      window.prompt(fr ? "Copiez ce code :" : "Copy this code:", code);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={
        fr
          ? "Touchez pour copier. Collez-le dans n'importe quelle appli de cartes, ou lisez-le au téléphone."
          : "Tap to copy. Paste it into any map app, or read it out over the phone."
      }
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800/60 px-2 py-1 font-mono text-[11px] text-mist-300 hover:text-mist-100"
    >
      <MapPin className="h-3 w-3 text-gold-300" />
      {label ? <span className="font-sans text-mist-500">{label}</span> : null}
      {code}
      {copied ? <Check className="h-3 w-3 text-safe" /> : <Copy className="h-3 w-3 text-mist-500" />}
    </button>
  );
}
