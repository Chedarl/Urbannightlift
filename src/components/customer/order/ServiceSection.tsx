"use client";

import { useEffect } from "react";
import {
  type Control,
  type UseFormRegister,
  type UseFormWatch,
  type UseFormSetValue,
  type FieldErrors,
} from "react-hook-form";
import { ImageUp, ShieldCheck, Clock, Boxes, MapPin } from "lucide-react";
import type { OrderInput } from "@/lib/validation/orderSchema";
import type { ServiceExperience } from "@/lib/services/experiences";
import type { ServiceType } from "@prisma/client";
import { ItemListBuilder } from "@/components/customer/order/ItemListBuilder";
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

/** Small pill-group used for enum-ish choices unique to a service. */
function Chips({
  value,
  options,
  onPick,
  accent,
}: {
  value: string | undefined;
  options: { v: string; label: string }[];
  onPick: (v: string) => void;
  accent: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onPick(o.v)}
          className={cn(
            "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
            value === o.v ? "border-transparent text-ink-950" : "border-ink-700 bg-ink-800 text-mist-400"
          )}
          style={value === o.v ? { backgroundColor: accent } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function UploadTile({
  label,
  uploadedName,
  uploading,
  handleFile,
  hint,
}: {
  label: string;
  uploadedName: string | null;
  uploading: boolean;
  handleFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
}) {
  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-800 px-3 py-3 text-sm",
          uploadedName ? "text-safe" : "text-mist-500"
        )}
      >
        <ImageUp className="h-5 w-5" />
        {uploading ? "…" : uploadedName ? `${uploadedName}` : label}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </label>
      {hint && <p className="mt-1 flex items-center gap-1 text-xs text-mist-500"><ShieldCheck className="h-3 w-3" /> {hint}</p>}
    </div>
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
  const { exp, control, register, watch, setValue, locale, inputCls, labelCls, focusRing, t } = p;
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
    case "FOOD_PICKUP":
      return (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <Title accent={accent}>{t("svc.food.cravingTitle")}</Title>
            <ItemListBuilder
              control={control}
              register={register}
              name="serviceDetails.foodItems"
              accent={accent}
              addLabel={t("svc.food.addDish")}
              emptyRow={{ name: "", qty: 1, notes: "" }}
              columns={[
                { key: "name", placeholder: fr ? "Plat (ex. Poulet DG)" : "Dish (e.g. Poulet DG)", grow: 3 },
                { key: "qty", placeholder: "Qté", type: "number", min: 1, grow: 1 },
                { key: "notes", placeholder: fr ? "Note (piment…)" : "Note (spicy…)", grow: 2 },
              ]}
            />
          </section>
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("svc.food.whereTitle")}</Title>
            <Chips
              accent={accent}
              value={(sd?.sourcePref as string) ?? "any"}
              onPick={(v) => setValue("serviceDetails.sourcePref" as never, v as never)}
              options={[
                { v: "any", label: t("svc.food.anyPlace") },
                { v: "specific", label: t("svc.food.specificPlace") },
              ]}
            />
            {(sd?.sourcePref as string) === "specific" && (
              <input className={inputCls} style={focusRing} placeholder={t("svc.food.restaurant")} {...register("serviceDetails.place" as never)} />
            )}
          </section>
        </div>
      );

    /* ───────── MEDICINE — clinical, private, prescription-forward ───────── */
    case "MEDICINE_PICKUP":
      return (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-950/30 p-3 text-xs text-teal-200">
            <ShieldCheck className="h-4 w-4 shrink-0" /> {t("svc.medicine.privacy")}
          </div>
          <section className="flex flex-col gap-3">
            <Title accent={accent}>{t("svc.medicine.listTitle")}</Title>
            <ItemListBuilder
              control={control}
              register={register}
              name="serviceDetails.meds"
              accent={accent}
              addLabel={t("svc.medicine.addMed")}
              emptyRow={{ name: "", dosage: "", qty: 1 }}
              columns={[
                { key: "name", placeholder: fr ? "Médicament" : "Medicine", grow: 3 },
                { key: "dosage", placeholder: fr ? "Dosage" : "Dosage", grow: 2 },
                { key: "qty", placeholder: "Qté", type: "number", min: 1, grow: 1 },
              ]}
            />
          </section>
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("svc.medicine.pharmacyTitle")}</Title>
            <Chips
              accent={accent}
              value={(sd?.pharmacyPref as string) ?? "nearest"}
              onPick={(v) => setValue("serviceDetails.pharmacyPref" as never, v as never)}
              options={[
                { v: "nearest", label: t("svc.medicine.nearestOpen") },
                { v: "specific", label: t("svc.medicine.specificPharmacy") },
              ]}
            />
            {(sd?.pharmacyPref as string) === "specific" && (
              <input className={inputCls} style={focusRing} placeholder={t("svc.medicine.pharmacyName")} {...register("serviceDetails.pharmacy" as never)} />
            )}
          </section>
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("orderForm.prescriptionRequired")}</Title>
            <Chips
              accent={accent}
              value={(watch("prescriptionRequired") as string) ?? undefined}
              onPick={(v) => setValue("prescriptionRequired", v as "YES" | "NO" | "NOT_SURE")}
              options={[
                { v: "YES", label: t("common.yes") },
                { v: "NO", label: t("common.no") },
                { v: "NOT_SURE", label: t("common.notSure") },
              ]}
            />
          </section>
          <section className="flex flex-col gap-2">
            <label className={labelCls}>{t("svc.medicine.patientNote")}</label>
            <textarea className={cn(inputCls, "min-h-20 resize-y")} style={focusRing} placeholder={t("svc.medicine.patientNoteHint")} {...register("serviceDetails.patientNote" as never)} />
            <UploadTile label={t("svc.medicine.uploadPrescription")} uploadedName={p.uploadedName} uploading={p.uploading} handleFile={p.handleFile} hint={t("svc.medicine.prescriptionPrivacy")} />
          </section>
        </div>
      );

    /* ───────── GROCERY — fresh, itemized shopping list + budget ───────── */
    case "GROCERY_PICKUP":
      return (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <Title accent={accent}>{t("svc.grocery.listTitle")}</Title>
            <ItemListBuilder
              control={control}
              register={register}
              name="serviceDetails.groceryItems"
              accent={accent}
              addLabel={t("svc.grocery.addItem")}
              emptyRow={{ name: "", qty: 1, brand: "" }}
              columns={[
                { key: "name", placeholder: fr ? "Article (ex. Riz 5kg)" : "Item (e.g. Rice 5kg)", grow: 3 },
                { key: "qty", placeholder: "Qté", type: "number", min: 1, grow: 1 },
                { key: "brand", placeholder: fr ? "Marque (opt.)" : "Brand (opt.)", grow: 2 },
              ]}
            />
          </section>
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("svc.grocery.budget")}</label>
              <input className={inputCls} style={focusRing} type="number" min={0} step={500} inputMode="numeric" placeholder="XAF" {...register("serviceDetails.budgetXaf" as never)} />
            </div>
            <div>
              <label className={labelCls}>{t("svc.grocery.store")}</label>
              <input className={inputCls} style={focusRing} placeholder={fr ? "Marché / magasin" : "Market / store"} {...register("serviceDetails.store" as never)} />
            </div>
          </section>
          <label className="flex items-center gap-3 text-sm text-mist-300">
            <input type="checkbox" className="h-4 w-4" style={{ accentColor: accent }} checked={Boolean(sd?.substituteOk)} onChange={(e) => setValue("serviceDetails.substituteOk" as never, e.target.checked as never)} />
            {t("svc.grocery.substituteOk")}
          </label>
        </div>
      );

    /* ───────── PARCEL — package size, contents, sender/recipient ───────── */
    case "SMALL_PARCEL":
      return (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("svc.parcel.sizeTitle")}</Title>
            <Chips
              accent={accent}
              value={(sd?.size as string) ?? "S"}
              onPick={(v) => setValue("serviceDetails.size" as never, v as never)}
              options={[
                { v: "S", label: t("svc.parcel.small") },
                { v: "M", label: t("svc.parcel.medium") },
                { v: "L", label: t("svc.parcel.large") },
              ]}
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-mist-500">
              <Boxes className="h-4 w-4" /> {t("svc.parcel.weightHint")}
            </div>
            <input className={inputCls} style={focusRing} placeholder={t("svc.parcel.weight")} {...register("serviceDetails.weight" as never)} />
          </section>
          <section className="flex flex-col gap-2">
            <label className={labelCls}>{t("svc.parcel.contents")} <span className="text-restricted">*</span></label>
            <textarea className={cn(inputCls, "min-h-20 resize-y")} style={focusRing} placeholder={t("svc.parcel.contentsHint")} {...register("itemDescription")} />
            {p.errors.itemDescription && <p className="text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
            <UploadTile label={t("svc.parcel.uploadPhoto")} uploadedName={p.uploadedName} uploading={p.uploading} handleFile={p.handleFile} hint={t("svc.parcel.photoPrivacy")} />
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-900/40 p-3">
              <p className="text-xs font-semibold text-mist-300">{t("svc.parcel.sender")}</p>
              <input className={inputCls} style={focusRing} placeholder={t("svc.parcel.name")} {...register("serviceDetails.senderName" as never)} />
              <input className={inputCls} style={focusRing} inputMode="tel" placeholder={t("svc.parcel.phone")} {...register("serviceDetails.senderPhone" as never)} />
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-900/40 p-3">
              <p className="text-xs font-semibold text-mist-300">{t("svc.parcel.recipient")}</p>
              <input className={inputCls} style={focusRing} placeholder={t("svc.parcel.name")} {...register("serviceDetails.recipientName" as never)} />
              <input className={inputCls} style={focusRing} inputMode="tel" placeholder={t("svc.parcel.phone")} {...register("serviceDetails.recipientPhone" as never)} />
            </div>
          </section>
        </div>
      );

    /* ───────── URGENT — speed-first, ETA + reason ───────── */
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
    case "CUSTOM_ERRAND":
      return (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <Title accent={accent}>{t("svc.errand.tellTitle")}</Title>
            <textarea className={cn(inputCls, "min-h-32 resize-y")} style={focusRing} placeholder={t("svc.errand.tellHint")} {...register("itemDescription")} />
            {p.errors.itemDescription && <p className="text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
          </section>
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("svc.errand.budget")}</label>
              <input className={inputCls} style={focusRing} type="number" min={0} step={500} inputMode="numeric" placeholder="XAF" {...register("serviceDetails.budgetXaf" as never)} />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm text-mist-300">
              <input type="checkbox" className="h-4 w-4" style={{ accentColor: accent }} checked={Boolean(watch("riderPaysAtPickup"))} onChange={(e) => setValue("riderPaysAtPickup", e.target.checked)} />
              {t("svc.errand.riderPays")}
            </label>
          </section>
        </div>
      );

    /* ───────── MERCHANT — merchant picked in engine, order details ───────── */
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
