"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  UtensilsCrossed, Pill, ShoppingBasket, Package, Zap, ClipboardList, Store,
  MessageCircle, ArrowRight, Clock, MapPinned, ShieldCheck, Wallet,
  Bike, FileText, Mail, Phone, MapPin, BellRing,
  UserPlus, UserCircle, Repeat, Bookmark, History,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getClosedNotice } from "@/lib/i18n/legal";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { Logo } from "@/components/shared/Logo";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { ComingSoonSheet } from "@/components/customer/ComingSoonSheet";
import { WelcomeBack } from "@/components/customer/order/fields/WelcomeBack";
import { cn } from "@/lib/utils";
import type { OperatingMode, ServiceType } from "@prisma/client";

const SUPPORT_EMAIL = "urbannightlift@gmail.com";
const PHONE_DISPLAY = "+237 680 038 004";

type L = { en: string; fr: string };
const tr = (fr: boolean, s: L) => (fr ? s.fr : s.en);

const SERVICES: { key: ServiceType; icon: React.ElementType; accent: string; title: L; desc: L }[] = [
  { key: "FOOD_PICKUP", icon: UtensilsCrossed, accent: "#f59e0b", title: { en: "Food pickup", fr: "Repas" }, desc: { en: "We pick up your food order from restaurants or vendors and deliver it to you at night.", fr: "Nous récupérons votre repas au restaurant ou chez le vendeur et vous le livrons la nuit." } },
  { key: "MEDICINE_PICKUP", icon: Pill, accent: "#2dd4bf", title: { en: "Medicine / pharmacy pickup", fr: "Médicaments / pharmacie" }, desc: { en: "We collect approved medicine or pharmacy items with care and confidentiality.", fr: "Nous récupérons vos médicaments avec soin et confidentialité." } },
  { key: "GROCERY_PICKUP", icon: ShoppingBasket, accent: "#22c55e", title: { en: "Grocery pickup", fr: "Courses" }, desc: { en: "We shop for your groceries and essentials from trusted stores or markets.", fr: "Nous faisons vos courses dans les magasins ou marchés de confiance." } },
  { key: "SMALL_PARCEL", icon: Package, accent: "#3b82f6", title: { en: "Small parcel delivery", fr: "Livraison de colis" }, desc: { en: "For small, safe, legal and declared items. Door-to-door delivery.", fr: "Pour les petits colis sûrs, légaux et déclarés. Livraison porte-à-porte." } },
  { key: "URGENT_ITEM", icon: Zap, accent: "#ef4444", title: { en: "Urgent item pickup", fr: "Ramassage urgent" }, desc: { en: "We pick up and deliver urgent items fast and with priority handling.", fr: "Nous livrons vos articles urgents rapidement, en priorité." } },
  { key: "CUSTOM_ERRAND", icon: ClipboardList, accent: "#c084fc", title: { en: "Custom errand request", fr: "Course personnalisée" }, desc: { en: "Tell us what you need and our dispatcher will handle the rest.", fr: "Dites-nous ce qu'il vous faut et notre dispatcher s'occupe du reste." } },
  { key: "MERCHANT_DELIVERY", icon: Store, accent: "#d946ef", title: { en: "Verified merchant delivery", fr: "Commerçant vérifié" }, desc: { en: "Pre-arranged delivery from our verified partner merchants.", fr: "Livraison depuis nos commerçants partenaires vérifiés." } },
];

const STEPS: { icon: React.ElementType; title: L; desc: L }[] = [
  { icon: FileText, title: { en: "Place your order", fr: "Passez commande" }, desc: { en: "Choose a service and tell us what you need. Add pickup and delivery details.", fr: "Choisissez un service et indiquez vos besoins, avec les lieux de ramassage et de livraison." } },
  { icon: Bike, title: { en: "We pick it up", fr: "Nous récupérons" }, desc: { en: "Our rider picks it up quickly and safely. You can track your order in real time.", fr: "Notre livreur récupère votre commande rapidement. Suivez-la en temps réel." } },
  { icon: Package, title: { en: "We deliver to you", fr: "Nous livrons" }, desc: { en: "Your order is delivered to your doorstep securely and on time, every time.", fr: "Votre commande est livrée à votre porte, en sécurité et à l'heure." } },
];

const FEATURES: { icon: React.ElementType; title: L; desc: L }[] = [
  { icon: Clock, title: { en: "Every night", fr: "Chaque nuit" }, desc: { en: "Available 6 PM–4 AM when you need us.", fr: "Disponibles de 18h à 4h quand vous en avez besoin." } },
  { icon: MapPinned, title: { en: "Live tracking", fr: "Suivi en direct" }, desc: { en: "Track your rider in real time from pickup to delivery.", fr: "Suivez votre livreur en temps réel." } },
  { icon: ShieldCheck, title: { en: "Verified riders", fr: "Livreurs vérifiés" }, desc: { en: "Trained, verified and professional riders.", fr: "Livreurs formés, vérifiés et professionnels." } },
  { icon: Wallet, title: { en: "Secure payments", fr: "Paiements sécurisés" }, desc: { en: "Pay with MTN MoMo, Orange Money or cash.", fr: "Payez par MTN MoMo, Orange Money ou espèces." } },
];

const AREAS = ["Yaoundé I", "Yaoundé II", "Yaoundé III", "Yaoundé IV", "Yaoundé V", "Yaoundé VI", "Yaoundé VII"];

/** 12 → "12 AM", 16 → "4 PM". Whole hours only; that is all we schedule on. */
function hourLabel(hour: number, fr: boolean): string {
  const h = ((hour % 24) + 24) % 24;
  if (fr) return `${h}h`;
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

/**
 * Whether we are actually taking orders right now, in Yaoundé time.
 *
 * For a night-only business this is the single most important thing on the
 * page, and it was never shown while open. Computed on the client against
 * Africa/Douala so it stays correct no matter where the visitor's device
 * thinks it is; null until mounted, so server and client markup match.
 */
function useOpenNow(mode: OperatingMode, startHour: number, endHour: number): boolean | null {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      if (mode !== "OPEN") {
        setOpen(false);
        return;
      }
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          hour: "numeric",
          hourCycle: "h23",
          timeZone: "Africa/Douala",
        }).format(new Date())
      );
      // The window wraps past midnight (18 → 4), so it is two ranges.
      setOpen(startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour);
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [mode, startHour, endHour]);

  return open;
}

/**
 * The hero visual. The 2.2 MB clip used to autoplay with `preload="auto"` on
 * every single visit — real money on a metered Cameroonian mobile plan, and it
 * sat on the critical path of the first paint.
 *
 * Now nothing is fetched until after mount, and then only if the connection
 * can afford it: data-saver, 2G/3G and reduced-motion visitors get the still
 * panel with a tap-to-play, so they choose to spend their bundle.
 */
function HeroMedia({ fr }: { fr: boolean }) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    const conn = (navigator as unknown as {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const saveData = conn?.saveData === true;
    const slow = ["slow-2g", "2g", "3g"].includes(conn?.effectiveType ?? "");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!saveData && !slow && !reduced) setPlay(true);
  }, []);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-ink-700 bg-gradient-to-br from-violet-900/40 via-ink-900 to-ink-950">
      {play ? (
        <video className="h-full w-full object-cover" src="/home-hero.mp4" autoPlay loop muted playsInline preload="auto" />
      ) : (
        <button
          type="button"
          onClick={() => setPlay(true)}
          className="flex h-full w-full flex-col items-center justify-center gap-3 text-center"
        >
          <Bike className="h-12 w-12 text-violet-300" />
          <span className="text-sm font-semibold text-mist-200">
            {fr ? "Urban Night Lift — la nuit, à Yaoundé" : "Urban Night Lift — Yaoundé, after dark"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-600 px-3 py-1 text-xs text-mist-400">
            {fr ? "Lire la vidéo (2 Mo)" : "Play video (2 MB)"}
          </span>
        </button>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-ink-950/60 via-transparent to-transparent" />
    </div>
  );
}

export function HomeContent({
  mode,
  startHour,
  endHour,
  enabledServices,
  signedIn,
}: {
  mode: OperatingMode;
  startHour: number;
  endHour: number;
  enabledServices: ServiceType[];
  signedIn: boolean;
}) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  // Services not yet launched show a "coming soon" card that captures interest
  // instead of linking to an order form.
  const [pending, setPending] = useState<(typeof SERVICES)[number] | null>(null);
  const openNow = useOpenNow(mode, startHour, endHour);
  const isLive = (key: ServiceType) => enabledServices.includes(key);
  const liveServices = SERVICES.filter((s) => isLive(s.key));
  const soonServices = SERVICES.filter((s) => !isLive(s.key));
  const greeting = fr ? "Bonsoir, je souhaite passer une commande Urban Night Lift." : "Good evening, I would like to place an Urban Night Lift order.";
  const waHref = buildWaLink(MAIN_WHATSAPP_NUMBER, greeting);

  const navLinks = [
    { label: { en: "Home", fr: "Accueil" }, href: "#top" },
    { label: { en: "Services", fr: "Services" }, href: "#services" },
    { label: { en: "How it works", fr: "Comment ça marche" }, href: "#how" },
    { label: { en: "Coverage", fr: "Zones" }, href: "#coverage" },
    { label: { en: "Help", fr: "Aide" }, href: "/help" },
  ];

  return (
    <div id="top" className="w-full">
      {/* ───── Top nav ───── */}
      <header className="sticky top-0 z-40 border-b border-ink-700/50 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Urban Night Lift home" className="flex items-center">
            <Logo height={32} />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-mist-300 transition-colors hover:text-mist-100">
                {tr(fr, l.label)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <Link href="/track" className="hidden rounded-full border border-violet-500/60 bg-violet-600/20 px-4 py-1.5 text-sm font-semibold text-violet-200 hover:bg-violet-600/30 sm:inline-flex">
              {fr ? "Suivre" : "Track Order"}
            </Link>
            {/* Account entry point. The full label needs room, so small screens
                get an icon-only button — there is no hamburger menu here. */}
            <Link
              href={signedIn ? "/account" : "/account/signup"}
              aria-label={signedIn ? (fr ? "Mon compte" : "My account") : (fr ? "Créer un compte" : "Sign up")}
              className="hidden rounded-full bg-gold-400 px-4 py-1.5 text-sm font-semibold text-ink-950 hover:bg-gold-300 md:inline-flex"
            >
              {signedIn ? (fr ? "Mon compte" : "My account") : (fr ? "Créer un compte" : "Sign up")}
            </Link>
            <Link
              href={signedIn ? "/account" : "/account/signup"}
              aria-label={signedIn ? (fr ? "Mon compte" : "My account") : (fr ? "Créer un compte" : "Sign up")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-400 text-ink-950 md:hidden"
            >
              {signedIn ? <UserCircle className="h-5 w-5" /> : <UserPlus className="h-4 w-4" />}
            </Link>
          </div>
        </div>
        {/* The desktop nav is hidden below md and there is no hamburger, which
            left Services / How it works / Coverage / Help unreachable on a
            phone — where nearly all of our traffic is. Same links, as a
            scrollable chip row. */}
        <nav className="flex gap-2 overflow-x-auto border-t border-ink-800/60 px-4 py-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-xs font-medium text-mist-300"
            >
              {tr(fr, l.label)}
            </a>
          ))}
        </nav>
      </header>

      {/* ───── Hero: the question first, the way Uber opens ───── */}
      <section id="services" className="relative overflow-hidden border-b border-ink-800">
        {/* A quiet night aurora behind the fold. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-violet-700/20 via-violet-900/5 to-transparent blur-2xl" />
        <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
          {/* Location + open state — DoorDash's "delivering to" line. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900/70 px-3 py-1.5 text-xs font-semibold text-mist-200">
              <MapPin className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Yaoundé · cette nuit" : "Yaoundé · tonight"}
            </span>
            {openNow !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  openNow ? "border-safe/40 bg-safe/10 text-safe" : "border-ink-600 bg-ink-900/70 text-mist-300"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", openNow ? "animate-pulse bg-safe" : "bg-mist-500")} />
                {openNow
                  ? fr ? `Ouvert · jusqu'à ${hourLabel(endHour, true)}` : `Open now · until ${hourLabel(endHour, false)}`
                  : fr ? `Fermé · ouvre à ${hourLabel(startHour, true)}` : `Closed · opens ${hourLabel(startHour, false)}`}
              </span>
            )}
          </div>

          <h1 className="mt-5 font-display text-4xl font-bold leading-tight md:text-5xl">
            {fr ? "De quoi avez-vous besoin " : "What do you need "}
            <span className="text-gold-400">{fr ? "cette nuit ?" : "tonight?"}</span>
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-mist-300">
            {fr
              ? "Nous récupérons et livrons à travers Yaoundé, de 18h à 4h — quand vous n'avez pas le temps, ou pas envie de sortir."
              : "We pick up and deliver across Yaoundé, 6 PM to 4 AM — for the nights you have no time, or no reason to go out."}
          </p>

          {/* A returning customer's shortcut. Nothing for guests. */}
          <div className="mt-5">
            <WelcomeBack accent="#9645de" fr={fr} />
          </div>

          {/* The service tiles ARE the hero — Uber leads with the choice, not a
              banner. Big, icon-forward, tappable. The video sits below as an
              ambient panel rather than on the critical path. */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {liveServices.map((s) => (
              <Link
                key={s.key}
                href={`/order/new?service=${s.key}`}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/60 p-4 transition-all hover:-translate-y-0.5 hover:border-ink-500"
                style={{ minHeight: "7rem" }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-300">
                  <s.icon className="h-6 w-6" />
                </span>
                <span className="mt-3 flex items-center justify-between gap-1">
                  <span className="font-display text-sm font-semibold leading-tight text-mist-100">{tr(fr, s.title)}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-violet-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </span>
              </Link>
            ))}
          </div>

          {/* Paused services — a scrollable chip rail, DoorDash's category row. */}
          {soonServices.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist-500">
                {fr ? "Bientôt — dites-nous si vous en avez besoin" : "Coming soon — tell us if you need it"}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {soonServices.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setPending(s)}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-ink-600 bg-ink-900/30 px-3 py-2 text-left hover:border-ink-500"
                  >
                    <s.icon className="h-4 w-4 shrink-0 text-violet-300/70" />
                    <span className="text-xs font-medium text-mist-300">{tr(fr, s.title)}</span>
                    <BellRing className="h-3 w-3 text-mist-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "CLOSED" && (
            <div className="mt-6 rounded-2xl border border-caution/25 bg-caution/[0.07] p-4 text-xs leading-relaxed text-gold-200">
              {getClosedNotice(locale)}
            </div>
          )}

          {/* The brand film, kept but demoted below the choice. */}
          <div className="mt-8">
            <HeroMedia fr={fr} />
          </div>
        </div>
      </section>

      {/* ───── Safety banner — Yango's "Safety Tools" card, our night promise ───── */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-800/30 via-ink-900 to-ink-950 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-200">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold md:text-2xl">
                {fr ? "Rentrez bien. La nuit est à nous." : "Get home safe. The night is ours."}
              </h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-mist-300">
                {fr
                  ? "Vous voyez qui arrive avant qu'il frappe, vous suivez la course en direct, et vous pouvez partager votre livraison avec un proche — le code n'est donné qu'à la porte."
                  : "See who's coming before they knock, follow the ride live, and share your delivery with someone you trust — the code is given only at the door."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { en: "Verified riders", fr: "Livreurs vérifiés" },
                  { en: "Live tracking", fr: "Suivi en direct" },
                  { en: "Share my delivery", fr: "Partager ma livraison" },
                  { en: "Code at the door", fr: "Code à la porte" },
                ].map((c) => (
                  <span key={c.en} className="rounded-full border border-violet-500/30 bg-violet-950/40 px-3 py-1 text-xs font-medium text-violet-200">
                    {tr(fr, c)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── How it works ───── */}
      <section id="how" className="border-y border-ink-800 bg-ink-900/30">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <h2 className="font-display text-2xl font-bold md:text-3xl">{fr ? "Comment " : "How "}<span className="text-violet-400">{fr ? "ça marche" : "it works"}</span></h2>
          <p className="mt-1 text-sm text-mist-400">{fr ? "Trois étapes simples pour être livré" : "Three simple steps to get your order delivered"}</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={i} className="relative rounded-2xl border border-ink-700 bg-ink-900/50 p-6">
                <span className="absolute -top-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">{i + 1}</span>
                <s.icon className="mx-auto mt-3 h-8 w-8 text-violet-300" />
                <h3 className="mt-3 font-display text-base font-semibold">{tr(fr, s.title)}</h3>
                <p className="mt-1 text-xs leading-relaxed text-mist-400">{tr(fr, s.desc)}</p>
              </div>
            ))}
          </div>

          {/* Feature strip */}
          <div className="mt-8 grid gap-4 rounded-2xl border border-ink-700 bg-ink-900/50 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-400"><f.icon className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold text-mist-100">{tr(fr, f.title)}</p>
                  <p className="text-xs text-mist-400">{tr(fr, f.desc)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Coverage ───── */}
      <section id="coverage" className="mx-auto max-w-6xl px-4 py-12 text-center">
        <h2 className="font-display text-2xl font-bold md:text-3xl">{fr ? "Nous couvrons " : "We cover "}<span className="text-gold-400">{fr ? "Yaoundé et ses environs" : "Yaoundé and around"}</span></h2>
        <p className="mt-1 text-sm text-mist-400">{fr ? "Les 7 arrondissements et les zones environnantes" : "Including all 7 arrondissements and surrounding areas"}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {AREAS.map((a) => {
            const hub = a === "Yaoundé VI";
            return (
              <div key={a} className={cn("relative flex h-20 items-center justify-center rounded-xl border text-sm font-medium", hub ? "border-gold-400/60 bg-gold-400/10 text-gold-200" : "border-ink-700 bg-ink-900/50 text-mist-200")}>
                {hub && <span className="absolute -top-2 rounded-full bg-gold-400 px-2 py-0.5 text-xs font-bold text-ink-950">{fr ? "Notre hub" : "Our hub"}</span>}
                {a}
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── Create an account ─────
          Shown to guests only. A signed-in visitor already reaches their
          account from the header and the footer — a third identical button
          here would be exactly the kind of duplication we are removing. */}
      {!signedIn && (
        <section className="mx-auto max-w-6xl px-4 pb-12">
          <div className="overflow-hidden rounded-3xl border border-gold-400/40 bg-gradient-to-r from-gold-400/10 via-ink-900 to-ink-900 p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-display text-xl font-bold">
                  {fr ? "Créez votre compte" : "Create your account"}
                </h3>
                <p className="mt-1 max-w-md text-sm text-mist-300">
                  {fr
                    ? "Commandez plus vite et gardez tout votre historique. Si vous avez déjà commandé avec votre numéro WhatsApp, vos commandes apparaîtront automatiquement."
                    : "Order faster and keep your full history. Already ordered with your WhatsApp number? Those orders appear automatically."}
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-mist-400">
                  <li className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-gold-400" />{fr ? "Historique des commandes" : "Order history"}</li>
                  <li className="inline-flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5 text-gold-400" />{fr ? "Recommander en un tap" : "One-tap reorder"}</li>
                  <li className="inline-flex items-center gap-1.5"><Bookmark className="h-3.5 w-3.5 text-gold-400" />{fr ? "Adresses enregistrées" : "Saved addresses"}</li>
                </ul>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Link href="/account/signup" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3 text-sm font-semibold text-ink-950 hover:bg-gold-300">
                  <UserPlus className="h-4 w-4" /> {fr ? "Créer un compte" : "Sign up"}
                </Link>
                <Link href="/account/login" className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-900/60 px-5 py-3 text-sm font-semibold text-mist-200 hover:border-gold-400/60">
                  {fr ? "Se connecter" : "Log in"}
                </Link>
              </div>
            </div>
            <p className="mt-4 text-xs text-mist-500">
              {fr
                ? "Pas besoin de compte pour commander. Connexion par numéro WhatsApp et code — nous ne demandons jamais votre code MoMo ou Orange Money."
                : "No account needed to order. Sign in with your WhatsApp number and a PIN — we never ask for your MoMo or Orange Money PIN."}
            </p>
          </div>
        </section>
      )}

      {/* ───── Install ─────
          Kept as a slim strip rather than a second full-width gradient card:
          two of those back to back made both easier to scroll past. */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-violet-700/40 bg-violet-900/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-mist-300">
            <span className="font-semibold text-mist-100">{fr ? "Installez l'application." : "Install the app."}</span>{" "}
            {fr ? "Sur votre écran d'accueil : commande et suivi en un tap." : "On your home screen — order and track in one tap."}
          </p>
          <InstallPrompt variant="app" className="shrink-0 px-4 py-2" />
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="border-t border-ink-800 bg-ink-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
          <div>
            <Logo height={32} />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-mist-400">{fr ? "Votre partenaire de livraison de nuit. Nous bougeons quand vous en avez besoin." : "Your trusted night delivery partner. We move when you need us most."}</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-mist-100">{fr ? "Entreprise" : "Company"}</p>
            {/* These three links were all crammed into a single <li>, so they
                ran together on one line. "About us" pointed at #top — the page
                you are already on — and is gone until there is a page to name. */}
            <ul className="flex flex-col gap-2 text-xs text-mist-400">
              <li><Link href={signedIn ? "/account" : "/account/signup"} className="hover:text-mist-200">{signedIn ? (fr ? "Mon compte" : "My account") : (fr ? "Créer un compte" : "Create an account")}</Link></li>
              <li><Link href="/rider/join" className="hover:text-mist-200">{fr ? "Devenir livreur" : "Become a rider"}</Link></li>
              <li><Link href="/merchant/join" className="hover:text-mist-200">{fr ? "Inscrire mon commerce" : "List my business"}</Link></li>
              <li><Link href="/rider/login" className="hover:text-mist-200">{fr ? "Connexion livreur" : "Rider sign in"}</Link></li>
              <li><Link href="/help#contact" className="hover:text-mist-200">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-mist-100">{fr ? "Assistance" : "Support"}</p>
            <ul className="flex flex-col gap-2 text-xs text-mist-400">
              {/* One link per destination. "Help center" already opens on the
                  FAQ, so a separate "FAQs" was the same page twice; "Track an
                  order" is always reachable from the header/floating Track
                  button, so it isn't repeated here either. */}
              <li><Link href="/help" className="hover:text-mist-200">{fr ? "Centre d'aide" : "Help center"}</Link></li>
              <li><Link href="/privacy" className="hover:text-mist-200">{fr ? "Confidentialité" : "Privacy"}</Link></li>
              <li><Link href="/terms" className="hover:text-mist-200">{fr ? "Conditions" : "Terms"}</Link></li>
              <li><Link href="/admin/login" className="hover:text-mist-200">{fr ? "Connexion staff" : "Staff login"}</Link></li>
            </ul>
          </div>
          <div>
            {/* "Follow us" showed three icons that were not links and led
                nowhere. Reachable contact details are the honest version. */}
            <p className="mb-3 text-sm font-semibold text-mist-100">{fr ? "Nous contacter" : "Contact us"}</p>
            <ul className="flex flex-col gap-2 text-xs text-mist-400">
              <li>
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-mist-200">
                  <MessageCircle className="h-3.5 w-3.5 text-safe" /> WhatsApp
                </a>
              </li>
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {PHONE_DISPLAY}</li>
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 hover:text-mist-200">
                  <Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}
                </a>
              </li>
              <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {fr ? "Yaoundé, Cameroun" : "Yaoundé, Cameroon"}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink-800 py-4 text-center text-xs text-mist-500">
          © {new Date().getFullYear()} Urban Night Lift. {fr ? "Tous droits réservés." : "All rights reserved."}
        </div>
      </footer>

      {pending && (
        <ComingSoonSheet
          serviceType={pending.key}
          serviceName={tr(fr, pending.title)}
          accent={pending.accent}
          onClose={() => setPending(null)}
        />
      )}

      {/* Mobile Track shortcut */}
      <Link href="/track" className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg sm:hidden">
        <MapPinned className="h-4 w-4" /> {fr ? "Suivre" : "Track"}
      </Link>
    </div>
  );
}
