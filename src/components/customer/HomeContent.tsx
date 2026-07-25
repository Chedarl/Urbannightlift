"use client";

import { useState } from "react";
import Link from "next/link";
import {
  UtensilsCrossed, Pill, ShoppingBasket, Package, Zap, ClipboardList, Store,
  MessageCircle, ArrowRight, Clock, MapPinned, ShieldCheck, Wallet, Star,
  Bike, FileText, Mail, Phone, MapPin, Globe, AtSign, Send, Share2, BellRing,
  UserPlus, UserCircle, Repeat, Bookmark, History,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getClosedNotice } from "@/lib/i18n/legal";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { Reveal } from "@/components/shared/motion";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { ComingSoonSheet } from "@/components/customer/ComingSoonSheet";
import { cn } from "@/lib/utils";
import type { OperatingMode, ServiceType } from "@prisma/client";

const SUPPORT_EMAIL = "urbannighlift@gmail.com";
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

export function HomeContent({
  mode,
  enabledServices,
  signedIn,
}: {
  mode: OperatingMode;
  enabledServices: ServiceType[];
  signedIn: boolean;
}) {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  // Services not yet launched show a "coming soon" card that captures interest
  // instead of linking to an order form.
  const [pending, setPending] = useState<(typeof SERVICES)[number] | null>(null);
  const isLive = (key: ServiceType) => enabledServices.includes(key);
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Urban Night Lift" className="h-8 w-auto" />
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
      </header>

      {/* ───── Hero ───── */}
      <section className="relative overflow-hidden border-b border-ink-800">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-16">
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
              {fr ? "Votre ville," : "Your city,"}<br />
              {fr ? "Notre course." : "Our ride."}<br />
              <span className="text-gold-400">{fr ? "Livré la nuit." : "Night "}</span>
              {!fr && <span className="text-violet-400">delivered.</span>}
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-mist-300">
              {fr
                ? "Livraison rapide, sûre et fiable à travers Yaoundé et autour de Biyem-Assi. Nous bougeons quand vous en avez le plus besoin."
                : "Fast, safe and reliable delivery across Yaoundé and around Biyem-Assi. We move when you need us most."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/order" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3 text-sm font-semibold text-ink-950 hover:bg-gold-300">
                <ShoppingBasket className="h-4 w-4" /> {fr ? "Passer une commande" : "Place an Order"}
              </Link>
              <a href="#services" className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-900/60 px-5 py-3 text-sm font-semibold text-mist-200 hover:border-violet-500/60">
                {fr ? "Voir les services" : "Explore Services"}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-mist-400">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-safe" /> {fr ? "Sûr & sécurisé" : "Safe & Secure"}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-gold-400" /> {fr ? "Toujours à l'heure" : "Always On Time"}</span>
              <span className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 text-violet-400" /> {fr ? "Approuvé par des milliers" : "Trusted by Thousands"}</span>
            </div>
          </div>

          {/* Video / rider visual */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-ink-700 bg-ink-900">
            <video className="h-full w-full object-cover" src="/home-hero.mp4" autoPlay loop muted playsInline preload="auto" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-ink-950/60 via-transparent to-transparent" />
          </div>
        </div>

        {mode === "CLOSED" && (
          <div className="mx-auto max-w-6xl px-4 pb-8">
            <div className="rounded-2xl border border-caution/25 bg-caution/[0.07] p-4 text-[13px] leading-relaxed text-gold-200">
              {getClosedNotice(locale)}
            </div>
          </div>
        )}
      </section>

      {/* ───── Services ───── */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-12">
        <Reveal>
          <h2 className="font-display text-2xl font-bold md:text-3xl">
            {fr ? "De quoi avez-vous besoin " : "What do you need "}<span className="text-violet-400">{fr ? "ce soir ?" : "tonight?"}</span>
          </h2>
          <p className="mt-1 text-sm text-mist-400">{fr ? "Choisissez un service pour commencer" : "Choose a service to get started"}</p>
        </Reveal>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) =>
            isLive(s.key) ? (
              <Link key={s.key} href={`/order/new?service=${s.key}`} className="group flex flex-col rounded-2xl border border-ink-700 bg-ink-900/50 p-5 transition-all hover:-translate-y-0.5 hover:border-ink-500">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${s.accent}22`, color: s.accent }}>
                  <s.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-3 font-display text-base font-semibold text-mist-100">{tr(fr, s.title)}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-mist-400">{tr(fr, s.desc)}</p>
                <ArrowRight className="mt-3 h-4 w-4 text-mist-500 transition-transform group-hover:translate-x-1" style={{ color: s.accent }} />
              </Link>
            ) : (
              <button
                key={s.key}
                type="button"
                onClick={() => setPending(s)}
                className="group relative flex flex-col rounded-2xl border border-dashed border-ink-600 bg-ink-900/30 p-5 text-left transition-all hover:border-ink-500"
              >
                <span className="absolute right-3 top-3 rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-mist-400">
                  {fr ? "Bientôt" : "Coming soon"}
                </span>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl opacity-50" style={{ backgroundColor: `${s.accent}18`, color: s.accent }}>
                  <s.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-3 font-display text-base font-semibold text-mist-300">{tr(fr, s.title)}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-mist-500">{tr(fr, s.desc)}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-mist-400">
                  <BellRing className="h-3.5 w-3.5" /> {fr ? "Prévenez-moi" : "Notify me"}
                </span>
              </button>
            )
          )}
          {/* 8th card — WhatsApp fallback */}
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center rounded-2xl border border-gold-400/50 bg-gradient-to-b from-gold-400/10 to-transparent p-5 text-center">
            <Star className="h-7 w-7 text-gold-400" />
            <h3 className="mt-2 font-display text-base font-semibold text-gold-200">{fr ? "Autre chose ?" : "Need something else?"}</h3>
            <p className="mt-1 text-xs text-mist-400">{fr ? "Discutez avec notre dispatcher sur WhatsApp." : "Chat with our dispatcher on WhatsApp."}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-safe/20 px-3 py-1.5 text-xs font-semibold text-safe"><MessageCircle className="h-4 w-4" /> WhatsApp</span>
          </a>
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
                {hub && <span className="absolute -top-2 rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-bold text-ink-950">{fr ? "Notre hub" : "Our hub"}</span>}
                {a}
              </div>
            );
          })}
        </div>
        <Link href="/help" className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-ink-600 px-4 py-2 text-xs text-mist-300 hover:text-mist-100">
          <MapPin className="h-3.5 w-3.5" /> {fr ? "Voir toutes les zones desservies" : "View all areas we serve"}
        </Link>
      </section>

      {/* ───── App CTA ───── */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-violet-700/40 bg-gradient-to-r from-violet-900/40 to-ink-900 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-display text-xl font-bold">{fr ? "Installez l'application" : "Install the app"}</h3>
            <p className="mt-1 max-w-md text-sm text-mist-300">{fr ? "Ajoutez Urban Night Lift à votre écran d'accueil : commandez et suivez vos livraisons en un tap." : "Add Urban Night Lift to your home screen — order and track deliveries in one tap."}</p>
          </div>
          <InstallPrompt variant="app" className="shrink-0 px-5 py-2.5" />
        </div>
      </section>

      {/* ───── Create an account ───── */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="overflow-hidden rounded-3xl border border-gold-400/40 bg-gradient-to-r from-gold-400/10 via-ink-900 to-ink-900 p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-xl font-bold">
                {signedIn
                  ? fr ? "Votre compte Urban Night Lift" : "Your Urban Night Lift account"
                  : fr ? "Créez votre compte" : "Create your account"}
              </h3>
              <p className="mt-1 max-w-md text-sm text-mist-300">
                {signedIn
                  ? fr
                    ? "Retrouvez vos commandes, vos adresses et recommandez en un tap."
                    : "See your orders, your saved addresses, and reorder in one tap."
                  : fr
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
              {signedIn ? (
                <Link href="/account" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3 text-sm font-semibold text-ink-950 hover:bg-gold-300">
                  <UserCircle className="h-4 w-4" /> {fr ? "Mon compte" : "My account"}
                </Link>
              ) : (
                <>
                  <Link href="/account/signup" className="inline-flex items-center gap-2 rounded-xl bg-gold-400 px-5 py-3 text-sm font-semibold text-ink-950 hover:bg-gold-300">
                    <UserPlus className="h-4 w-4" /> {fr ? "Créer un compte" : "Sign up"}
                  </Link>
                  <Link href="/account/login" className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-900/60 px-5 py-3 text-sm font-semibold text-mist-200 hover:border-gold-400/60">
                    {fr ? "Se connecter" : "Log in"}
                  </Link>
                </>
              )}
            </div>
          </div>
          <p className="mt-4 text-[11px] text-mist-500">
            {fr
              ? "Pas besoin de compte pour commander. Connexion par numéro WhatsApp et code — nous ne demandons jamais votre code MoMo ou Orange Money."
              : "No account needed to order. Sign in with your WhatsApp number and a PIN — we never ask for your MoMo or Orange Money PIN."}
          </p>
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="border-t border-ink-800 bg-ink-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Urban Night Lift" className="h-8 w-auto" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-mist-400">{fr ? "Votre partenaire de livraison de nuit. Nous bougeons quand vous en avez besoin." : "Your trusted night delivery partner. We move when you need us most."}</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-mist-100">{fr ? "Entreprise" : "Company"}</p>
            <ul className="flex flex-col gap-2 text-xs text-mist-400">
              <li><a href="#top" className="hover:text-mist-200">{fr ? "À propos" : "About us"}</a></li>
              <li><Link href="/account/signup" className="hover:text-mist-200">{fr ? "Créer un compte" : "Create an account"}</Link>
              <Link href="/account" className="hover:text-mist-200">{fr ? "Mon compte" : "My account"}</Link>
              <Link href="/rider/login" className="hover:text-mist-200">{fr ? "Devenir livreur" : "Become a rider"}</Link></li>
              <li><Link href="/help" className="hover:text-mist-200">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-mist-100">{fr ? "Assistance" : "Support"}</p>
            <ul className="flex flex-col gap-2 text-xs text-mist-400">
              <li><Link href="/help" className="hover:text-mist-200">{fr ? "Centre d'aide" : "Help center"}</Link></li>
              <li><Link href="/help" className="hover:text-mist-200">FAQs</Link></li>
              <li><Link href="/help" className="hover:text-mist-200">{fr ? "Sécurité" : "Safety"}</Link></li>
              <li><Link href="/admin/login" className="hover:text-mist-200">{fr ? "Connexion staff" : "Staff login"}</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-mist-100">{fr ? "Nous suivre" : "Follow us"}</p>
            <div className="mb-3 flex gap-3 text-mist-400">
              <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><MessageCircle className="h-4 w-4 hover:text-mist-200" /></a>
              <a href={`mailto:${SUPPORT_EMAIL}`} aria-label="Email"><AtSign className="h-4 w-4 hover:text-mist-200" /></a>
              <Globe className="h-4 w-4" /><Share2 className="h-4 w-4" /><Send className="h-4 w-4" />
            </div>
            <ul className="flex flex-col gap-2 text-xs text-mist-400">
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {PHONE_DISPLAY}</li>
              <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}</li>
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
