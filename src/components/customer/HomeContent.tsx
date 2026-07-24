"use client";

import Link from "next/link";
import { ShoppingBag, MapPin, MessageCircle, Clock, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getClosedNotice } from "@/lib/i18n/legal";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { NightSceneHero } from "@/components/customer/NightSceneHero";
import { Reveal } from "@/components/shared/motion";
import { cn } from "@/lib/utils";
import type { OperatingMode } from "@prisma/client";

export function HomeContent({ mode }: { mode: OperatingMode }) {
  const { t, locale } = useTranslation();
  const greeting =
    locale === "fr"
      ? "Bonsoir, je souhaite passer une commande Urban Night Lift."
      : "Good evening, I would like to place an Urban Night Lift order.";

  const tiles = [
    { href: "/order", icon: ShoppingBag, label: t("nav.order"), primary: true },
    { href: "/track", icon: MapPin, label: t("nav.track") },
    {
      href: buildWaLink(MAIN_WHATSAPP_NUMBER, greeting),
      icon: MessageCircle,
      label: "WhatsApp",
      external: true,
    },
  ];

  return (
    <div className="mx-auto max-w-lg pb-28">
      {/* Cinematic animated hero */}
      <NightSceneHero />

      {/* Minimal hero content overlapping the scene */}
      <div className="relative -mt-16 px-5">
        <Reveal>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Urban Night Lift" className="w-[70%] max-w-[260px] drop-shadow-[0_8px_40px_rgba(123,44,191,0.4)]" />
        </Reveal>

        <Reveal delay={1}>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-mist-300">{t("home.heroCtaSub")}</p>
        </Reveal>

        <Reveal delay={2}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                mode === "OPEN"
                  ? "border-safe/40 bg-safe/10 text-safe"
                  : mode === "PAUSED"
                    ? "border-caution/40 bg-caution/10 text-caution"
                    : "border-ink-600 bg-ink-800/60 text-mist-500"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", mode === "OPEN" ? "bg-safe" : mode === "PAUSED" ? "bg-caution" : "bg-mist-500")} />
              {mode === "OPEN" ? t("home.openNow") : mode === "PAUSED" ? t("home.pausedNow") : t("home.closedNow")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 text-xs text-mist-300">
              <Clock className="h-3.5 w-3.5 text-gold-400" /> {t("home.eta")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 text-xs text-mist-300">
              <MapPin className="h-3.5 w-3.5 text-violet-400" /> {t("home.zone")}
            </span>
          </div>
        </Reveal>
      </div>

      {/* Closed banner (minimal) */}
      {mode === "CLOSED" && (
        <Reveal delay={2} className="mt-5 px-5">
          <div className="rounded-2xl border border-caution/25 bg-caution/[0.07] p-4 text-[13px] leading-relaxed text-gold-200">
            {getClosedNotice(locale)}
          </div>
        </Reveal>
      )}

      {/* Action tiles — the whole homepage narrows to these */}
      <Reveal delay={3} className="mt-6 px-5">
        <div className="grid grid-cols-3 gap-3">
          {tiles.map(({ href, icon: Icon, label, primary, external }) => {
            const inner = (
              <div
                className={cn(
                  "group flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center transition-all hover:-translate-y-0.5",
                  primary
                    ? "border-gold-400/50 bg-gradient-to-b from-gold-400/15 to-transparent"
                    : "border-ink-700/70 bg-ink-900/50 hover:border-violet-500/60"
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    primary ? "bg-gold-400 text-ink-950" : "bg-violet-600/20 text-violet-300"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className={cn("text-sm font-semibold", primary ? "text-gold-300" : "text-mist-200")}>{label}</span>
              </div>
            );
            return external ? (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <Link key={label} href={href}>
                {inner}
              </Link>
            );
          })}
        </div>
      </Reveal>

      {/* One slim reassurance strip, then done */}
      <Reveal delay={4} className="mt-5 px-5">
        <Link
          href="/order"
          className="flex items-center justify-between rounded-2xl border border-violet-700/40 bg-violet-950/30 px-4 py-3.5"
        >
          <span className="text-sm font-medium text-violet-200">{t("home.safetyPositioning")}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-gold-400" />
        </Link>
      </Reveal>
    </div>
  );
}
