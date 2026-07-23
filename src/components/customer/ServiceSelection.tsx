"use client";

import Link from "next/link";
import {
  UtensilsCrossed,
  Pill,
  ShoppingBasket,
  Package,
  Zap,
  ClipboardList,
  Store,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { ServiceType } from "@prisma/client";

const services: { type: ServiceType; icon: React.ElementType }[] = [
  { type: "FOOD_PICKUP", icon: UtensilsCrossed },
  { type: "MEDICINE_PICKUP", icon: Pill },
  { type: "GROCERY_PICKUP", icon: ShoppingBasket },
  { type: "SMALL_PARCEL", icon: Package },
  { type: "URGENT_ITEM", icon: Zap },
  { type: "CUSTOM_ERRAND", icon: ClipboardList },
  { type: "MERCHANT_DELIVERY", icon: Store },
];

export function ServiceSelection() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-8">
      <h1 className="font-display text-2xl font-bold">{t("services.title")}</h1>
      <p className="mt-1 text-sm text-mist-500">{t("services.subtitle")}</p>
      <div className="mt-6 flex flex-col gap-3">
        {services.map(({ type, icon: Icon }) => (
          <Link
            key={type}
            href={`/order/new?service=${type}`}
            className="group flex items-center gap-4 rounded-xl border border-ink-700 bg-ink-900 p-4 transition-colors hover:border-violet-500"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300 group-hover:bg-violet-600/30">
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{t(`services.${type}.name`)}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-mist-500">
                {t(`services.${type}.description`)}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-mist-500 group-hover:text-gold-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
