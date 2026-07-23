"use client";

import Link from "next/link";
import {
  MessageCircle,
  Clock,
  MapPin,
  ShieldCheck,
  Moon,
  ArrowRight,
  UtensilsCrossed,
  Pill,
  ShoppingBasket,
  Package,
  Zap,
  ClipboardList,
  Store,
  BadgeCheck,
  Camera,
  Wallet,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getClosedNotice } from "@/lib/i18n/legal";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { LinkButton } from "@/components/shared/Button";
import { cn } from "@/lib/utils";
import type { OperatingMode, ServiceType } from "@prisma/client";

const CATEGORIES: { type: ServiceType; icon: React.ElementType; grad: string }[] = [
  { type: "FOOD_PICKUP", icon: UtensilsCrossed, grad: "from-orange-500/25 to-amber-500/10 text-amber-300" },
  { type: "MEDICINE_PICKUP", icon: Pill, grad: "from-emerald-500/25 to-teal-500/10 text-emerald-300" },
  { type: "GROCERY_PICKUP", icon: ShoppingBasket, grad: "from-lime-500/25 to-green-500/10 text-lime-300" },
  { type: "SMALL_PARCEL", icon: Package, grad: "from-sky-500/25 to-blue-500/10 text-sky-300" },
  { type: "URGENT_ITEM", icon: Zap, grad: "from-yellow-500/25 to-gold-400/10 text-gold-300" },
  { type: "CUSTOM_ERRAND", icon: ClipboardList, grad: "from-violet-500/25 to-fuchsia-500/10 text-violet-300" },
  { type: "MERCHANT_DELIVERY", icon: Store, grad: "from-pink-500/25 to-rose-500/10 text-pink-300" },
];

export function HomeContent({ mode }: { mode: OperatingMode }) {
  const { t, locale } = useTranslation();
  const greeting =
    locale === "fr"
      ? "Bonsoir, je souhaite passer une commande Urban Night Lift."
      : "Good evening, I would like to place an Urban Night Lift order.";

  const steps = [
    { icon: Sparkles, title: t("home.step1Title"), body: t("home.step1Body") },
    { icon: Moon, title: t("home.step2Title"), body: t("home.step2Body") },
    { icon: Camera, title: t("home.step3Title"), body: t("home.step3Body") },
  ];

  const trust = [
    { icon: BadgeCheck, label: t("home.trustVerified") },
    { icon: Camera, label: t("home.trustProof") },
    { icon: Wallet, label: t("home.trustPrepay") },
    { icon: ShieldCheck, label: t("home.trustInsured") },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-4">
      {/* Status pill */}
      <div className="animate-fade-up flex items-center justify-between">
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
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              mode === "OPEN" ? "bg-safe animate-pulse-glow" : mode === "PAUSED" ? "bg-caution" : "bg-mist-500"
            )}
          />
          {mode === "OPEN" ? t("home.openNow") : mode === "PAUSED" ? t("home.pausedNow") : t("home.closedNow")}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 text-xs text-mist-300">
          <Clock className="h-3.5 w-3.5 text-gold-400" /> {t("home.eta")}
        </span>
      </div>

      {/* Hero */}
      <section className="animate-fade-up mt-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Urban Night Lift — livraison en toute assurance"
          className="w-[86%] max-w-[330px] drop-shadow-[0_8px_40px_rgba(123,44,191,0.35)]"
        />
        <p className="mt-5 text-[15px] leading-relaxed text-mist-300">{t("home.heroCtaSub")}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-mist-500">
          <MapPin className="h-4 w-4 text-violet-400" /> {t("home.zone")} · {t("home.serviceArea")}
        </p>
      </section>

      {/* Closed banner */}
      {mode === "CLOSED" && (
        <div className="animate-fade-up mt-5 rounded-2xl border border-caution/25 bg-caution/[0.07] p-4 text-[13px] leading-relaxed text-gold-200">
          {getClosedNotice(locale)}
        </div>
      )}

      {/* Primary CTA */}
      <div className="animate-fade-up mt-6 flex flex-col gap-3">
        <LinkButton href="/order" size="lg" className="w-full text-base">
          <Moon className="h-5 w-5" /> {t("home.placeOrder")}
          <ArrowRight className="ml-auto h-5 w-5" />
        </LinkButton>
        <div className="grid grid-cols-2 gap-3">
          <LinkButton href="/track" variant="outline" size="lg" className="w-full">
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
            <MessageCircle className="h-5 w-5" /> WhatsApp
          </LinkButton>
        </div>
      </div>

      {/* Category tiles */}
      <section className="animate-fade-up mt-9">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{t("home.deliverTitle")}</h2>
          <Link href="/order" className="flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-400">
            {t("home.browseAll")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {CATEGORIES.map(({ type, icon: Icon, grad }) => (
            <Link
              key={type}
              href={`/order/new?service=${type}`}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-ink-700/60 bg-ink-900/40 p-2.5 text-center transition-all hover:-translate-y-0.5 hover:border-violet-500/60"
            >
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br", grad)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[10.5px] font-medium leading-tight text-mist-300">
                {t(`services.${type}.name`).split(" ")[0]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="animate-fade-up mt-9">
        <h2 className="mb-3 font-display text-lg font-bold">{t("home.howItWorksTitle")}</h2>
        <div className="flex flex-col gap-2.5">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={i} className="glass flex items-start gap-3 rounded-2xl p-4">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600/20 text-violet-300">
                <Icon className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold-400 text-[9px] font-bold text-ink-950">
                  {i + 1}
                </span>
              </span>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-mist-500">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="animate-fade-up mt-9">
        <h2 className="mb-3 font-display text-lg font-bold">{t("home.trustTitle")}</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {trust.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-2xl border border-ink-700/60 bg-ink-900/40 px-3.5 py-3"
            >
              <Icon className="h-5 w-5 shrink-0 text-gold-400" />
              <span className="text-[12.5px] font-medium leading-tight text-mist-300">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Promise footer */}
      <p className="animate-fade-up mt-8 text-center text-xs leading-relaxed text-mist-500">
        {t("home.promise")}
      </p>
    </div>
  );
}
