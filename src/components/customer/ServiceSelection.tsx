"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  UtensilsCrossed,
  Pill,
  ShoppingBasket,
  Package,
  Zap,
  ClipboardList,
  Store,
  ArrowRight,
  BellRing,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { ComingSoonSheet } from "@/components/customer/ComingSoonSheet";
import { getExperience } from "@/lib/services/experiences";
import type { ServiceType } from "@prisma/client";

const services: { type: ServiceType; icon: React.ElementType; grad: string }[] = [
  { type: "FOOD_PICKUP", icon: UtensilsCrossed, grad: "from-orange-500/25 to-amber-500/10 text-amber-300" },
  { type: "MEDICINE_PICKUP", icon: Pill, grad: "from-emerald-500/25 to-teal-500/10 text-emerald-300" },
  { type: "GROCERY_PICKUP", icon: ShoppingBasket, grad: "from-lime-500/25 to-green-500/10 text-lime-300" },
  { type: "SMALL_PARCEL", icon: Package, grad: "from-sky-500/25 to-blue-500/10 text-sky-300" },
  { type: "URGENT_ITEM", icon: Zap, grad: "from-yellow-500/25 to-gold-400/10 text-gold-300" },
  { type: "CUSTOM_ERRAND", icon: ClipboardList, grad: "from-violet-500/25 to-fuchsia-500/10 text-violet-300" },
  { type: "MERCHANT_DELIVERY", icon: Store, grad: "from-pink-500/25 to-rose-500/10 text-pink-300" },
];

export function ServiceSelection({ enabledServices }: { enabledServices: ServiceType[] }) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  // A paused service opens the interest sheet instead of the order form.
  const [pending, setPending] = useState<ServiceType | null>(null);
  const isLive = (type: ServiceType) => enabledServices.includes(type);
  // Carried in when the customer tapped a saved place in the portal: whichever
  // service they pick then opens with that delivery address already set.
  const deliverTo = useSearchParams().get("deliverTo");
  const suffix = deliverTo ? `&deliverTo=${encodeURIComponent(deliverTo)}` : "";
  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-6">
      <h1 className="animate-fade-up font-display text-2xl font-bold">{t("services.title")}</h1>
      <p className="animate-fade-up mt-1 text-sm text-mist-500">{t("services.subtitle")}</p>
      <div className="animate-fade-up mt-6 flex flex-col gap-3">
        {services.map(({ type, icon: Icon, grad }) =>
          isLive(type) ? (
            <Link
              key={type}
              href={`/order/new?service=${type}${suffix}`}
              className="group flex items-center gap-4 rounded-2xl border border-ink-700/60 bg-ink-900/40 p-4 transition-all hover:-translate-y-0.5 hover:border-violet-500/60"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${grad}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[15px] font-semibold">{t(`services.${type}.name`)}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mist-500">
                  {t(`services.${type}.description`)}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-mist-500 transition-colors group-hover:text-gold-400" />
            </Link>
          ) : (
            <button
              key={type}
              type="button"
              onClick={() => setPending(type)}
              className="flex items-center gap-4 rounded-2xl border border-dashed border-ink-600 bg-ink-900/20 p-4 text-left transition-colors hover:border-ink-500"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br opacity-50 ${grad}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="block font-display text-[15px] font-semibold text-mist-300">{t(`services.${type}.name`)}</span>
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-mist-400">
                    {fr ? "Bientôt" : "Coming soon"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mist-500">
                  {t(`services.${type}.description`)}
                </span>
              </span>
              <BellRing className="h-5 w-5 shrink-0 text-mist-500" />
            </button>
          )
        )}
      </div>

      {pending && (
        <ComingSoonSheet
          serviceType={pending}
          serviceName={t(`services.${pending}.name`)}
          accent={getExperience(pending).accent}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
