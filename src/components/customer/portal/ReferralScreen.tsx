"use client";

import { useState } from "react";
import { Gift, Copy, Check, MessageCircle, Coins } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildWaLink } from "@/lib/whatsapp/links";
import { formatXaf } from "@/lib/utils";
import { PageHeader, CardGroup } from "@/components/customer/portal/kit";

/**
 * Credit and the referral code, on their own screen — the reference apps'
 * "Discounts / invite a friend" page. One number (what you have to spend), one
 * code, and the two ways to pass it on. The growth loop, made shareable.
 */
export function ReferralScreen({
  code,
  creditXaf,
  rewardPercent,
  friendsBrought,
}: {
  code: string | null;
  creditXaf: number;
  rewardPercent: number;
  friendsBrought: number;
}) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const [copied, setCopied] = useState(false);

  const share = fr
    ? `Commande la nuit avec Urban Night Lift à Yaoundé. Utilise mon code ${code} pour commencer : https://urbannighlift.com`
    : `Order at night with Urban Night Lift in Yaoundé. Use my code ${code} to start: https://urbannighlift.com`;

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-6">
      <PageHeader title={fr ? "Crédit et parrainage" : "Credit & referrals"} back="/account/profile" />

      {/* Credit balance */}
      <div className="rounded-2xl border border-gold-400/40 bg-gradient-to-br from-gold-400/12 to-transparent p-5 text-center">
        <Coins className="mx-auto h-6 w-6 text-gold-300" />
        <p className="mt-2 font-display text-3xl font-bold text-mist-100">{formatXaf(creditXaf)}</p>
        <p className="text-xs text-mist-400">
          {creditXaf > 0
            ? fr
              ? "Appliqué automatiquement à votre prochaine commande"
              : "Applied automatically to your next order"
            : fr
              ? "Gagnez du crédit en parrainant un ami"
              : "Earn credit by referring a friend"}
        </p>
      </div>

      {/* The code */}
      {code && (
        <div className="rounded-2xl border border-violet-500/35 bg-violet-950/20 p-5 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-violet-300">
            <Gift className="h-3.5 w-3.5" /> {fr ? "Votre code" : "Your code"}
          </p>
          <p className="mt-2 font-display text-4xl font-bold tracking-[0.3em] text-mist-100">{code}</p>
          <p className="mt-2 text-xs text-mist-400">
            {fr
              ? `Quand un ami commande avec votre code, vous gagnez ${rewardPercent}% de sa livraison en crédit.`
              : `When a friend orders with your code, you earn ${rewardPercent}% of their delivery fee as credit.`}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={copy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-700 py-2.5 text-sm font-semibold text-mist-200 hover:text-mist-100"
            >
              {copied ? <Check className="h-4 w-4 text-safe" /> : <Copy className="h-4 w-4" />}
              {copied ? (fr ? "Copié" : "Copied") : fr ? "Copier" : "Copy"}
            </button>
            <a
              href={buildWaLink("", share)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-safe/90 py-2.5 text-sm font-bold text-ink-950 hover:bg-safe"
            >
              <MessageCircle className="h-4 w-4" /> {fr ? "Partager" : "Share"}
            </a>
          </div>
        </div>
      )}

      {friendsBrought > 0 && (
        <CardGroup>
          <p className="px-4 py-3.5 text-sm text-mist-300">
            {fr
              ? `Vous avez amené ${friendsBrought} ami${friendsBrought > 1 ? "s" : ""}. Merci !`
              : `You've brought in ${friendsBrought} friend${friendsBrought > 1 ? "s" : ""}. Thank you!`}
          </p>
        </CardGroup>
      )}
    </div>
  );
}
