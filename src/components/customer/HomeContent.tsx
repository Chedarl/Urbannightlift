"use client";

import Link from "next/link";
import { MessageCircle, Clock, MapPin, ShieldCheck, Moon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getClosedNotice, RESTRICTED_ZONE_NOTICE_EN, RESTRICTED_ZONE_NOTICE_FR } from "@/lib/i18n/legal";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { LinkButton } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import type { OperatingMode } from "@prisma/client";

export function HomeContent({ mode }: { mode: OperatingMode }) {
  const { t, locale } = useTranslation();

  const greeting =
    locale === "fr"
      ? "Bonsoir, je souhaite passer une commande Urban Night Lift."
      : "Good evening, I would like to place an Urban Night Lift order.";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 pb-16 pt-8">
      {/* Operating banner */}
      {mode === "OPEN" ? (
        <Badge tone="safe" className="self-start">
          <span className="h-1.5 w-1.5 rounded-full bg-safe" /> {t("home.openNow")}
        </Badge>
      ) : mode === "PAUSED" ? (
        <Badge tone="caution" className="self-start">
          <span className="h-1.5 w-1.5 rounded-full bg-caution" /> {t("home.pausedNow")}
        </Badge>
      ) : (
        <div className="rounded-xl border border-caution/30 bg-caution/10 p-4 text-sm text-gold-200">
          {getClosedNotice(locale)}
        </div>
      )}

      {/* Hero */}
      <div>
        <h1 className="font-display text-4xl font-bold leading-tight">
          Urban Night <span className="text-gold-400">Lift</span>
        </h1>
        <p className="mt-1 text-sm font-medium uppercase tracking-wider text-gold-400">
          {t("home.brandTagline")}
        </p>
        <p className="mt-2 text-lg text-violet-300">{t("home.tagline")}</p>
        <p className="mt-1 text-sm text-mist-500">{t("home.services")}</p>
      </div>

      <p className="text-sm leading-relaxed text-mist-300">{t("home.promise")}</p>

      {/* CTAs */}
      <div className="flex flex-col gap-3">
        <LinkButton href="/order" size="lg" className="w-full">
          <Moon className="h-5 w-5" /> {t("home.placeOrder")}
        </LinkButton>
        <LinkButton href="/track" variant="secondary" size="lg" className="w-full">
          {t("home.trackOrder")}
        </LinkButton>
        <LinkButton
          href={buildWaLink(MAIN_WHATSAPP_NUMBER, greeting)}
          target="_blank"
          rel="noopener noreferrer"
          variant="whatsapp"
          size="lg"
          className="w-full"
        >
          <MessageCircle className="h-5 w-5" /> {t("home.chatWhatsApp")}
        </LinkButton>
      </div>

      {/* Info cards */}
      <div className="grid gap-3">
        <div className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
          <p className="text-sm text-mist-300">{t("home.operatingHours")}</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
          <div className="text-sm text-mist-300">
            <p>{t("home.serviceArea")}</p>
            <p className="mt-1 text-xs text-mist-500">{t("home.launchNote")}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-violet-700/40 bg-violet-950/40 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
          <p className="text-sm font-medium text-violet-300">{t("home.safetyPositioning")}</p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-mist-500">
        {locale === "fr" ? RESTRICTED_ZONE_NOTICE_FR : RESTRICTED_ZONE_NOTICE_EN}
      </p>
    </div>
  );
}
