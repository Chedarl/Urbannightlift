"use client";

import { useEffect, useState } from "react";
import { MoonStar, Download, Share2, X, Loader2 } from "lucide-react";
import { generateWelcomeCardBlob, type WelcomeCardData } from "@/components/shared/welcomeCard";
import { useTranslation } from "@/lib/i18n";

/**
 * The first thing a new customer sees inside the portal.
 *
 * They have just handed us a phone number and a PIN and been dropped into an
 * app they have never used. This says hello, says what we do, and offers them
 * the card.
 *
 * **Share is the interesting button.** `navigator.share` with a `files` array
 * hands the PDF to the phone's own share sheet, which on Android and iOS lists
 * WhatsApp — so the card reaches WhatsApp with no Meta Business account, no
 * approved template and no per-message cost. It is the customer sending it
 * rather than us pushing it, which is the honest limit of what a web app can
 * do here, and it costs nothing.
 *
 * Where the browser has no share sheet, or refuses files, it falls back to a
 * download. Nothing here is load-bearing: dismissing it loses nothing, because
 * the card stays available from the account screen.
 */
export function WelcomeBanner() {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [card, setCard] = useState<WelcomeCardData | null>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/account/welcome")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d?.card) setCard({ ...d.card, joinedAt: new Date(d.card.joinedAt) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!card || dismissed) return null;

  const first = card.name.trim().split(/\s+/)[0] || card.name;
  const filename = `urban-night-lift-${fr ? "bienvenue" : "welcome"}.pdf`;

  async function withBlob(what: "share" | "download") {
    if (!card) return;
    setBusy(what);
    try {
      const blob = await generateWelcomeCardBlob(card);
      const file = new File([blob], filename, { type: "application/pdf" });

      if (
        what === "share" &&
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Urban Night Lift",
          text: fr ? "Ma carte Urban Night Lift" : "My Urban Night Lift card",
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      // A cancelled share sheet throws too, and telling somebody off for
      // changing their mind would be absurd.
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-violet-700/40 bg-gradient-to-b from-violet-900/40 to-ink-900 p-5">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={fr ? "Fermer" : "Dismiss"}
        className="absolute right-3 top-3 rounded-lg p-1 text-mist-500 hover:text-mist-200"
      >
        <X className="h-4 w-4" />
      </button>

      <MoonStar className="h-6 w-6 text-gold-400" />
      <h2 className="mt-2 text-xl font-bold text-mist-100">
        {fr ? `Bienvenue, ${first}` : `Welcome, ${first}`}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-mist-300">
        {fr
          ? `Nous livrons de ${card.openFrom} à ${card.openTo}, chaque nuit — repas, pharmacie, courses, colis. Dites-nous ce qu'il vous faut, nous allons le chercher.`
          : `We deliver from ${card.openFrom} to ${card.openTo}, every night — food, pharmacy, groceries, parcels. Tell us what you need and we go and get it.`}
      </p>

      {card.referralCode && (
        <p className="mt-3 text-sm text-mist-300">
          {fr ? "Votre code : " : "Your code: "}
          <span className="font-mono font-bold tracking-widest text-gold-300">
            {card.referralCode}
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => withBlob("share")}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy === "share" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {fr ? "Partager ma carte" : "Share my card"}
        </button>
        <button
          type="button"
          onClick={() => withBlob("download")}
          disabled={busy !== null}
          className="flex items-center gap-2 rounded-xl border border-ink-700 px-4 py-2.5 text-sm font-semibold text-mist-300 disabled:opacity-60"
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {fr ? "Télécharger" : "Download"}
        </button>
      </div>
    </section>
  );
}
