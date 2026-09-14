"use client";

import { useState } from "react";
import { QuickIntake } from "@/components/customer/order/QuickIntake";
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

// One brand: the icon distinguishes the service, the colour stays violet — no
// per-service rainbow. Matches the portal home and the public hero.
const services: { type: ServiceType; icon: React.ElementType }[] = [
  { type: "FOOD_PICKUP", icon: UtensilsCrossed },
  { type: "MEDICINE_PICKUP", icon: Pill },
  { type: "GROCERY_PICKUP", icon: ShoppingBasket },
  { type: "SMALL_PARCEL", icon: Package },
  { type: "URGENT_ITEM", icon: Zap },
  { type: "CUSTOM_ERRAND", icon: ClipboardList },
  { type: "MERCHANT_DELIVERY", icon: Store },
];

export function ServiceSelection({
  enabledServices,
  /**
   * Whether the one-sentence box has a model behind it.
   *
   * Decided on the server, because the browser has no way of knowing and the
   * alternative is a box that accepts a sentence and answers "not available" —
   * a worse first impression than the tiles on their own, which have always
   * been the way in and always work.
   */
  intakeEnabled = false,
}: {
  enabledServices: ServiceType[];
  intakeEnabled?: boolean;
}) {
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

      {/* For somebody who already knows what they want. Deciding whether pizza
          is "food pickup" or "merchant delivery" is our taxonomy, not theirs —
          this lets them say it and lands them on the same form with the boxes
          filled. Nothing is ordered by it. */}
      {intakeEnabled && (
        <div className="animate-fade-up mt-5">
          <QuickIntake enabledServices={enabledServices} />
        </div>
      )}

      <div className="animate-fade-up flex flex-col gap-3">
        {services.map(({ type, icon: Icon }) =>
          isLive(type) ? (
            <Link
              key={type}
              href={`/order/new?service=${type}${suffix}`}
              className="group flex items-center gap-4 rounded-2xl border border-ink-700/60 bg-ink-900/40 p-4 transition-all hover:-translate-y-0.5 hover:border-violet-500/60"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-300">
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-semibold">{t(`services.${type}.name`)}</span>
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
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300/60">
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="block font-display text-base font-semibold text-mist-300">{t(`services.${type}.name`)}</span>
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-semibold text-mist-400">
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
