"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UtensilsCrossed,
  Pill,
  ShoppingBasket,
  Package,
  Zap,
  ClipboardList,
  Store,
  Repeat,
  MapPin,
  Navigation,
  ChevronRight,
  Gift,
  ShieldCheck,
  LifeBuoy,
  Moon,
  Home as HomeIcon,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { InitialAvatar } from "@/components/customer/portal/kit";
import { useTranslation } from "@/lib/i18n";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";
import { formatXaf, cn } from "@/lib/utils";
import {
  greeting,
  relationshipLine,
  type PrimaryIntent,
} from "@/lib/account/personalize";
import type { OrderStatus, PaymentMethod, PreferredLanguage, ServiceType } from "@prisma/client";

/**
 * The client portal, rebuilt as the app you open — not a settings page.
 *
 * The reference points are the two ride apps people here already trust: Yango
 * in Abidjan and Uber in Yaoundé. Both open the same way — a warm, personal
 * top, then the single thing you are most likely to want (the trip you are on,
 * or your usual), then the full menu, then your places and your history. None
 * of it is a generic dashboard; all of it is *yours*.
 *
 * What each person sees is decided from their own history: a delivery in flight
 * floats to the very top as a live "your order tonight" card; a regular is met
 * with their usual as the first, largest tile; a newcomer is welcomed and shown
 * the menu. The greeting knows the hour in Yaoundé and knows their name.
 */

const SERVICE_UI: Record<ServiceType, { icon: React.ElementType; ring: string; glow: string; text: string }> = {
  FOOD_PICKUP: { icon: UtensilsCrossed, ring: "from-amber-500/30 to-orange-600/5", glow: "shadow-amber-500/20", text: "text-amber-300" },
  MEDICINE_PICKUP: { icon: Pill, ring: "from-teal-500/30 to-emerald-600/5", glow: "shadow-teal-500/20", text: "text-teal-300" },
  GROCERY_PICKUP: { icon: ShoppingBasket, ring: "from-lime-500/30 to-green-600/5", glow: "shadow-lime-500/20", text: "text-lime-300" },
  SMALL_PARCEL: { icon: Package, ring: "from-sky-500/30 to-blue-600/5", glow: "shadow-sky-500/20", text: "text-sky-300" },
  URGENT_ITEM: { icon: Zap, ring: "from-yellow-500/30 to-gold-400/5", glow: "shadow-gold-400/20", text: "text-gold-300" },
  CUSTOM_ERRAND: { icon: ClipboardList, ring: "from-violet-500/30 to-fuchsia-600/5", glow: "shadow-violet-500/20", text: "text-violet-300" },
  MERCHANT_DELIVERY: { icon: Store, ring: "from-pink-500/30 to-rose-600/5", glow: "shadow-pink-500/20", text: "text-pink-300" },
};

const ORDER: ServiceType[] = [
  "FOOD_PICKUP",
  "MEDICINE_PICKUP",
  "GROCERY_PICKUP",
  "SMALL_PARCEL",
  "URGENT_ITEM",
  "CUSTOM_ERRAND",
  "MERCHANT_DELIVERY",
];

export interface PortalOrder {
  orderCode: string;
  createdAt: string;
  orderStatus: OrderStatus;
  serviceType: ServiceType;
  itemDescription: string;
  quantity: number;
  declaredValueXaf: number;
  feeXaf: number | null;
  pickupLocation: string;
  pickupLandmark: string | null;
  deliveryLocation: string;
  deliveryLandmark: string | null;
  paymentMethod: PaymentMethod;
  serviceDetails: Record<string, unknown> | null;
  canReorder: boolean;
}

export interface PortalAddress {
  id: string;
  label: string;
  locationText: string;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  zoneId: string | null;
}

export interface PortalData {
  customer: {
    fullName: string;
    whatsappNumber: string;
    preferredLanguage: PreferredLanguage;
    nights: number;
    lifetimeFeesXaf: number;
    referralCode: string | null;
    creditXaf: number;
  };
  enabledServices: ServiceType[];
  favoriteService: ServiceType | null;
  activeOrderCode: string | null;
  intent: PrimaryIntent;
  orders: PortalOrder[];
  addresses: PortalAddress[];
}

export function PortalHome({ data }: { data: PortalData }) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();

  const active = data.orders.find((o) => o.orderCode === data.activeOrderCode) ?? null;
  const firstName = (data.customer.fullName || "").trim().split(/\s+/)[0] || (fr ? "vous" : "there");
  // Brand new: nothing to show yet, so lead with getting them set up.
  const isNew = data.orders.length === 0 && data.addresses.length === 0;

  // A regular's usual leads the menu; everything else follows in the usual
  // order, paused services dropped. A newcomer just gets the standard order.
  const services = useMemo(() => {
    const enabled = ORDER.filter((s) => data.enabledServices.includes(s));
    if (data.favoriteService && enabled.includes(data.favoriteService)) {
      return [data.favoriteService, ...enabled.filter((s) => s !== data.favoriteService)];
    }
    return enabled;
  }, [data.enabledServices, data.favoriteService]);

  const recent = data.orders.filter((o) => o.orderCode !== data.activeOrderCode).slice(0, 6);
  const reorderable = recent.find((o) => o.canReorder) ?? null;

  function reorder(o: PortalOrder) {
    const draft: OrderDraft = {
      fullName: data.customer.fullName,
      whatsappNumber: data.customer.whatsappNumber,
      preferredLanguage: data.customer.preferredLanguage,
      serviceType: o.serviceType,
      itemDescription: o.itemDescription,
      quantity: o.quantity,
      declaredValueXaf: o.declaredValueXaf,
      pickupLocation: o.pickupLocation,
      pickupLandmark: o.pickupLandmark ?? "",
      deliveryLocation: o.deliveryLocation,
      deliveryLandmark: o.deliveryLandmark ?? "",
      paymentMethod: o.paymentMethod,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: o.serviceType === "MEDICINE_PICKUP",
      acceptedTerms: true,
      serviceDetails: o.serviceDetails ?? undefined,
      estimatedFeeXaf: o.feeXaf,
    } as OrderDraft;
    saveDraft(draft);
    router.push("/order/review");
  }

  return (
    <div className="relative mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-5">
      {/* A quiet aurora behind the whole portal — the night, made ambient. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-violet-700/20 via-violet-900/5 to-transparent blur-2xl" />

      {/* ── Greeting: the portal knows who you are and what hour it is ── */}
      <header className="animate-fade-up flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-violet-300">
            <Moon className="h-3.5 w-3.5" /> {greeting(fr, new Date())},
          </p>
          <h1 className="truncate font-display text-3xl font-bold text-mist-100">{firstName}</h1>
          <p className="mt-0.5 text-sm text-mist-400">{relationshipLine(data.customer.nights, fr)}</p>
        </div>
        <Link href="/account/profile" aria-label={fr ? "Profil" : "Profile"} className="shrink-0">
          <InitialAvatar name={data.customer.fullName} className="h-11 w-11 text-lg ring-2 ring-ink-700 transition-transform active:scale-95" />
        </Link>
      </header>

      {/* ── The live order, if there is one: the "trip you're on" ── */}
      {active && <ActiveOrderCard order={active} fr={fr} />}

      {/* ── First run: seed the portal so the second visit already feels
             personal — save a Home place, and install the app. Shown only to a
             brand-new customer with nothing yet, and never again once they act. ── */}
      {isNew && (
        <section className="animate-rise-in rounded-2xl border border-gold-400/35 bg-gradient-to-br from-gold-400/10 to-transparent p-4">
          <p className="flex items-center gap-2 font-display text-sm font-semibold text-gold-200">
            <Sparkles className="h-4 w-4" /> {fr ? "Bienvenue — préparons la nuit" : "Welcome — let's set you up"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-mist-400">
            {fr
              ? "Enregistrez votre adresse et installez l'app : votre prochaine commande sera prête en quelques secondes."
              : "Save your address and install the app, and your next order is ready in seconds."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/account/addresses"
              className="flex items-center gap-1.5 rounded-xl bg-gold-400 px-3 py-2 text-xs font-bold text-ink-950 hover:bg-gold-300"
            >
              <HomeIcon className="h-3.5 w-3.5" /> {fr ? "Enregistrer mon adresse" : "Save my address"}
            </Link>
            <InstallPrompt className="rounded-xl border border-ink-700 px-3 py-2 text-xs font-semibold text-mist-200 hover:border-violet-500/50" />
          </div>
        </section>
      )}

      {/* ── What do you need tonight — the menu, your usual first ── */}
      <section>
        <h2 className="mb-3 font-display text-base font-semibold text-mist-100">
          {fr ? "De quoi avez-vous besoin cette nuit ?" : "What do you need tonight?"}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {services.map((type, i) => {
            const ui = SERVICE_UI[type];
            const Icon = ui.icon;
            const usual = i === 0 && data.favoriteService === type && !active;
            return (
              <div
                key={type}
                className={cn("animate-fade-up", usual && "col-span-2")}
                style={{ animationDelay: `${0.04 * i}s` }}
              >
                <Link
                  href={`/order/new?service=${type}`}
                  className={cn(
                    "group relative flex h-full items-center gap-3 overflow-hidden rounded-2xl border border-ink-700 bg-gradient-to-br p-4 transition-transform active:scale-[0.98]",
                    ui.ring,
                    usual ? "shadow-lg" : "",
                    ui.glow
                  )}
                >
                  <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-950/50", ui.text)}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0">
                    {usual && (
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-widest text-mist-400">
                        {fr ? "Votre habitude" : "Your usual"}
                      </span>
                    )}
                    <span className="block truncate font-display text-[15px] font-semibold text-mist-100">
                      {t(`services.${type}.name`)}
                    </span>
                    <span className="block truncate text-[11px] text-mist-400">{t(`services.${type}.description`)}</span>
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-mist-500 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Saved places: one-tap deliver-there, Yango's Home/Work chips ── */}
      {data.addresses.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-mist-200">{fr ? "Vos adresses" : "Your places"}</h2>
            <Link href="/account/addresses" className="text-[11px] text-violet-300 hover:text-violet-200">
              {fr ? "Gérer" : "Manage"}
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.addresses.slice(0, 6).map((a) => (
              // Deliver here: tapping a place carries it into the order flow as
              // the delivery address, so a saved place is a one-tap shortcut —
              // not the same thing as the "Order" tab. Adding/editing places
              // lives behind the single "Manage" link above.
              <Link
                key={a.id}
                href={`/order?deliverTo=${encodeURIComponent(a.id)}`}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-mist-300 hover:border-violet-500/50"
              >
                <PlaceIcon label={a.label} />
                <span className="max-w-[9rem] truncate">
                  <span className="font-medium text-mist-200">{a.label}</span>
                  <span className="block truncate text-[10px] text-mist-500">{a.locationText}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Order again: the strongest one-tap for a returning customer ── */}
      {reorderable && (
        <section>
          <h2 className="mb-2 font-display text-sm font-semibold text-mist-200">{fr ? "Recommander" : "Order again"}</h2>
          <button
            type="button"
            onClick={() => reorder(reorderable)}
            className="flex w-full items-center gap-3 rounded-2xl border border-gold-400/40 bg-gradient-to-r from-gold-400/10 to-transparent p-4 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
              <Repeat className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-mist-100">{reorderable.itemDescription}</span>
              <span className="block truncate text-[11px] text-mist-400">
                {t(`services.${reorderable.serviceType}.name`)} · {reorderable.deliveryLocation}
              </span>
            </span>
            <span className="shrink-0 rounded-lg bg-gold-400 px-3 py-1.5 text-xs font-bold text-ink-950">
              {fr ? "Encore" : "Again"}
            </span>
          </button>
        </section>
      )}

      {/* ── Credit & referrals: a reason to come back, and to bring a friend ── */}
      {(data.customer.creditXaf > 0 || data.customer.referralCode) && (
        <section className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <Gift className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              {data.customer.creditXaf > 0 ? (
                <>
                  <p className="text-sm font-semibold text-mist-100">
                    {formatXaf(data.customer.creditXaf)} {fr ? "de crédit" : "in credit"}
                  </p>
                  <p className="text-[11px] text-mist-400">
                    {fr ? "Appliqué automatiquement à votre prochaine commande." : "Applied automatically to your next order."}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-mist-100">{fr ? "Parrainez un ami" : "Bring a friend"}</p>
                  <p className="text-[11px] text-mist-400">
                    {fr ? "Gagnez du crédit quand ils commandent." : "Earn credit when they order."}
                  </p>
                </>
              )}
            </div>
            {data.customer.referralCode && (
              <span className="shrink-0 rounded-lg border border-violet-500/40 px-2.5 py-1 font-mono text-xs font-bold tracking-widest text-violet-200">
                {data.customer.referralCode}
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── History: quiet, at the bottom, where a ride app keeps it ── */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm font-semibold text-mist-200">{fr ? "Historique" : "Your activity"}</h2>
          <ul className="flex flex-col gap-1.5">
            {recent.map((o) => (
              <li key={o.orderCode}>
                <Link
                  href={`/order/confirmation/${o.orderCode}`}
                  className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2.5 hover:border-ink-600"
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-950/60", SERVICE_UI[o.serviceType].text)}>
                    {(() => {
                      const Icon = SERVICE_UI[o.serviceType].icon;
                      return <Icon className="h-4 w-4" />;
                    })()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-mist-200">{o.itemDescription}</span>
                    <span className="block text-[11px] text-mist-500">
                      {new Date(o.createdAt).toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "2-digit", month: "short" })} ·{" "}
                      {t(`customerStatus.${CUSTOMER_STATUS_KEY[o.orderStatus]}`)}
                      {o.feeXaf != null && ` · ${formatXaf(o.feeXaf)}`}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-mist-600" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The promise, restated where it reassures: safety and help, in-portal ── */}
      <section className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2.5 text-[11px] text-mist-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-safe" />
          {fr ? "Livraison suivie, en toute sécurité." : "Every delivery tracked, safely."}
        </div>
        {/* Straight to contacting support — the Help tab in the bottom nav
            already covers the help centre and FAQ, so this is a distinct
            destination, not a second door to the same page. */}
        <Link
          href="/help#contact"
          className="flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2.5 text-[11px] text-mist-400 hover:text-mist-200"
        >
          <LifeBuoy className="h-4 w-4 shrink-0 text-violet-300" />
          {fr ? "Contacter le support" : "Contact support"}
        </Link>
      </section>
    </div>
  );
}

/**
 * The order in flight, front and centre — the portal's answer to a ride app's
 * "your trip". Its accent follows the service, it names the live step, and its
 * whole surface is a tap into the tracking screen.
 */
function ActiveOrderCard({ order, fr }: { order: PortalOrder; fr: boolean }) {
  const { t } = useTranslation();
  const ui = SERVICE_UI[order.serviceType];
  const Icon = ui.icon;
  return (
    <div className="animate-rise-in">
      <Link
        href={`/order/confirmation/${order.orderCode}`}
        className={cn(
          "relative flex items-center gap-3 overflow-hidden rounded-2xl border border-violet-500/40 bg-gradient-to-br p-4 shadow-lg shadow-violet-500/10",
          ui.ring
        )}
      >
        <span aria-hidden className="absolute right-4 top-4 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-safe/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-safe" />
        </span>
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-950/50", ui.text)}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">
            {fr ? "Votre commande cette nuit" : "Your order tonight"}
          </p>
          <p className="truncate font-display text-base font-semibold text-mist-100">{order.itemDescription}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mist-300">
            <Navigation className="h-3 w-3 text-safe" />
            {t(`customerStatus.${CUSTOMER_STATUS_KEY[order.orderStatus]}`)}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white">
          {fr ? "Suivre" : "Track"}
        </span>
      </Link>
    </div>
  );
}

/** Home and Work get their own glyphs, the way saved places do in a ride app. */
function PlaceIcon({ label }: { label: string }) {
  const l = label.toLowerCase();
  if (l.includes("home") || l.includes("maison")) return <HomeIcon className="h-4 w-4 text-mist-400" />;
  if (l.includes("work") || l.includes("bureau") || l.includes("travail")) return <Briefcase className="h-4 w-4 text-mist-400" />;
  return <MapPin className="h-4 w-4 text-mist-400" />;
}
