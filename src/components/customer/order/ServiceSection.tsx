"use client";

import { useEffect } from "react";
import {
  type Control,
  type UseFormRegister,
  type UseFormWatch,
  type UseFormSetValue,
  type FieldErrors,
} from "react-hook-form";
import { Clock, MapPin } from "lucide-react";
import type { OrderInput } from "@/lib/validation/orderSchema";
import type { ServiceExperience } from "@/lib/services/experiences";
import type { ServiceType } from "@prisma/client";
import { cn } from "@/lib/utils";

export interface ServiceSectionProps {
  service: ServiceType;
  exp: ServiceExperience;
  control: Control<OrderInput>;
  register: UseFormRegister<OrderInput>;
  watch: UseFormWatch<OrderInput>;
  setValue: UseFormSetValue<OrderInput>;
  errors: FieldErrors<OrderInput>;
  t: (k: string) => string;
  locale: "en" | "fr";
  inputCls: string;
  labelCls: string;
  focusRing: React.CSSProperties;
  uploadedName: string | null;
  uploading: boolean;
  handleFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Title({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <h2 className="font-display text-sm font-semibold" style={{ color: accent }}>
      {children}
    </h2>
  );
}



/**
 * Renders the distinctive, service-specific part of the order form. Shared
 * plumbing (locations, customer, payment, terms) lives in the OrderForm engine.
 * Structured answers are written under `serviceDetails.*`; for services built on
 * an item list, a readable `itemDescription` is composed automatically so the
 * admin/rider/WhatsApp views stay meaningful.
 */
export function ServiceSection(p: ServiceSectionProps) {
  const { exp, register, watch, setValue, locale, inputCls, labelCls, focusRing, t } = p;
  const accent = exp.accent;
  const fr = locale === "fr";
  const sd = watch("serviceDetails") as Record<string, unknown> | undefined;

  // Keep the required itemDescription in sync from item-list services.
  useEffect(() => {
    if (p.service === "FOOD_PICKUP") {
      const items = (sd?.foodItems as { name?: string; qty?: string | number }[] | undefined) ?? [];
      const text = items.filter((i) => i?.name).map((i) => `${i.qty || 1}× ${i.name}`).join(", ");
      if (text) setValue("itemDescription", text, { shouldValidate: true });
    } else if (p.service === "GROCERY_PICKUP") {
      const items = (sd?.groceryItems as { name?: string; qty?: string | number }[] | undefined) ?? [];
      const text = items.filter((i) => i?.name).map((i) => `${i.qty || 1}× ${i.name}`).join(", ");
      if (text) setValue("itemDescription", text, { shouldValidate: true });
    } else if (p.service === "MEDICINE_PICKUP") {
      const items = (sd?.meds as { name?: string; dosage?: string; qty?: string | number }[] | undefined) ?? [];
      const text = items.filter((i) => i?.name).map((i) => `${i.qty || 1}× ${i.name}${i.dosage ? ` (${i.dosage})` : ""}`).join(", ");
      if (text) setValue("itemDescription", text, { shouldValidate: true });
    }
  }, [sd, p.service, setValue]);

  switch (p.service) {
    /* ───────── FOOD — warm, "what are you craving?" + dish builder ───────── */
    case "URGENT_ITEM":
      return (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs font-medium text-rose-200">
            <Clock className="h-4 w-4 shrink-0" /> {t("svc.urgent.banner")}
          </div>
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("svc.urgent.whatTitle")}</Title>
            <textarea className={cn(inputCls, "min-h-24 resize-y")} style={focusRing} placeholder={t("svc.urgent.whatHint")} {...register("itemDescription")} />
            {p.errors.itemDescription && <p className="text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
          </section>
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("svc.urgent.deadline")}</label>
              <input className={inputCls} style={focusRing} placeholder={fr ? "Avant 22h30" : "By 10:30 PM"} {...register("serviceDetails.deadline" as never)} />
            </div>
            <div>
              <label className={labelCls}>{t("svc.urgent.reason")}</label>
              <input className={inputCls} style={focusRing} placeholder={fr ? "Pourquoi urgent ?" : "Why urgent?"} {...register("serviceDetails.reason" as never)} />
            </div>
          </section>
        </div>
      );

    /* ───────── ERRAND — conversational, free-form + steps ───────── */
    case "MERCHANT_DELIVERY":
      return (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 rounded-xl border border-pink-500/30 bg-pink-950/20 p-3 text-xs text-pink-200">
            <MapPin className="h-4 w-4 shrink-0" /> {t("svc.merchant.hint")}
          </div>
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("svc.merchant.orderTitle")}</Title>
            <textarea className={cn(inputCls, "min-h-24 resize-y")} style={focusRing} placeholder={t("svc.merchant.orderHint")} {...register("itemDescription")} />
            {p.errors.itemDescription && <p className="text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
            <input className={inputCls} style={focusRing} placeholder={t("svc.merchant.counterRef")} {...register("serviceDetails.counterRef" as never)} />
          </section>
        </div>
      );

    default:
      return null;
  }
}
