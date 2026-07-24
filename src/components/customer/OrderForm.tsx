"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  UtensilsCrossed,
  Pill,
  ShoppingBasket,
  Package,
  Zap,
  ClipboardList,
  Store,
  ImageUp,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getDisclaimer } from "@/lib/i18n/legal";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee, TIER_META, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { getExperience } from "@/lib/services/experiences";
import { Button } from "@/components/shared/Button";
import { formatXaf, cn } from "@/lib/utils";
import type { PickedPoint } from "@/components/customer/LocationPicker";
import type { MerchantCategory, ServiceType } from "@prisma/client";

const LocationPicker = dynamic(() => import("@/components/customer/LocationPicker").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-2xl border border-ink-700 bg-ink-900/50" />,
});

const ICONS: Record<string, React.ElementType> = {
  UtensilsCrossed, Pill, ShoppingBasket, Package, Zap, ClipboardList, Store,
};

export interface MerchantOption {
  id: string;
  merchantName: string;
  category: MerchantCategory;
  address: string;
  landmark: string | null;
  openingHours: string | null;
}

const SERVICE_TYPES: ServiceType[] = [
  "FOOD_PICKUP", "MEDICINE_PICKUP", "GROCERY_PICKUP", "SMALL_PARCEL", "URGENT_ITEM", "CUSTOM_ERRAND", "MERCHANT_DELIVERY",
];

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none focus:ring-2";
const labelCls = "mb-1 block text-sm font-medium text-mist-300";

function OrderFormInner({ merchants }: { merchants: MerchantOption[] }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const service = (SERVICE_TYPES as string[]).includes(searchParams.get("service") ?? "")
    ? (searchParams.get("service") as ServiceType)
    : "FOOD_PICKUP";
  const exp = getExperience(service);
  const Icon = ICONS[exp.icon] ?? UtensilsCrossed;

  const [pickup, setPickup] = useState<PickedPoint | null>(null);
  const [delivery, setDelivery] = useState<PickedPoint | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantOption | null>(null);

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema) as Resolver<OrderInput>,
    defaultValues: {
      preferredLanguage: locale === "fr" ? "FR" : "EN",
      serviceType: service,
      quantity: 1,
      declaredValueXaf: 0,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: service === "MEDICINE_PICKUP",
      paymentMethod: "MTN_MOMO",
      acceptedTerms: undefined as unknown as true,
    },
  });

  const isMedicine = watch("isMedicine");
  const acceptedTerms = watch("acceptedTerms");

  const estimatedFee = useMemo(() => {
    const toZone = (p: PickedPoint | null) =>
      p?.zoneId ? { id: p.zoneId, feeXaf: p.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (p.tier ?? "GREEN") as ZoneTier } : null;
    return estimateDeliveryFee(toZone(pickup), toZone(delivery), { isMedicine });
  }, [pickup, delivery, isMedicine]);

  const dominantTier: ZoneTier | null =
    delivery?.tier ?? pickup?.tier ?? null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "order-screenshots", fileName: file.name }),
      });
      if (!res.ok) throw new Error();
      const { signedUrl, path } = await res.json();
      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      setValue("screenshotUrl", path);
      setUploadedName(file.name);
    } catch {
      setUploadedName(null);
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(data: OrderInput) {
    const pickupLoc = selectedMerchant
      ? `${selectedMerchant.merchantName} — ${selectedMerchant.address}`
      : pickup?.label || data.pickupLocation || "Pickup point (see map)";
    const deliveryLoc = delivery?.label || data.deliveryLocation || "Delivery point (see map)";

    const merged: OrderInput = {
      ...data,
      pickupLocation: pickupLoc,
      deliveryLocation: deliveryLoc,
      pickupLandmark: selectedMerchant?.landmark ?? data.pickupLandmark ?? "",
      merchantId: selectedMerchant?.id ?? "",
      pickupZoneId: pickup?.zoneId ?? "",
      deliveryZoneId: delivery?.zoneId ?? "",
      pickupLat: pickup?.lat ?? null,
      pickupLng: pickup?.lng ?? null,
      deliveryLat: delivery?.lat ?? null,
      deliveryLng: delivery?.lng ?? null,
    };

    saveDraft({
      ...merged,
      estimatedFeeXaf: estimatedFee,
      pickupZoneName: pickup?.zoneName ?? undefined,
      deliveryZoneName: delivery?.zoneName ?? undefined,
      merchantName: selectedMerchant?.merchantName,
    });
    router.push("/order/review");
  }

  const merchantLayout = exp.layout === "merchant";
  const conversational = exp.layout === "conversational";
  const focusRing = { "--tw-ring-color": `${exp.accent}66` } as React.CSSProperties;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-lg pb-28" noValidate>
      {/* Themed hero */}
      <div className={cn("relative overflow-hidden rounded-b-[2rem] bg-gradient-to-b px-5 pb-8 pt-10", exp.gradient)}>
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: `${exp.accent}33` }} />
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${exp.accent}22`, color: exp.accent }}>
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold">{t(exp.titleKey)}</h1>
        <p className="mt-1 text-sm text-mist-300">{t(exp.taglineKey)}</p>
      </div>

      <div className="flex flex-col gap-6 px-5 pt-6">
        {/* Merchant picker (merchant layout only) */}
        {merchantLayout && merchants.length > 0 && (
          <section>
            <h2 className="mb-2 font-display text-sm font-semibold" style={{ color: exp.accent }}>
              {t("orderForm.selectMerchant")}
            </h2>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {merchants.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMerchant(selectedMerchant?.id === m.id ? null : m)}
                  className={cn(
                    "shrink-0 rounded-2xl border p-3 text-left transition-colors",
                    selectedMerchant?.id === m.id ? "border-transparent" : "border-ink-700 bg-ink-900/50"
                  )}
                  style={selectedMerchant?.id === m.id ? { backgroundColor: `${exp.accent}22`, borderColor: exp.accent } : undefined}
                >
                  <span className="block text-sm font-semibold text-mist-100">{m.merchantName}</span>
                  <span className="block text-xs text-mist-500">{t(`admin.merchants.categories.${m.category}`)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Lead field — the star of each service */}
        <section>
          <label className={labelCls}>{t(exp.leadFieldKey)}</label>
          <textarea
            className={cn(inputCls, conversational ? "min-h-32" : "min-h-24", "resize-y")}
            style={focusRing}
            placeholder={t(exp.leadFieldKey)}
            {...register("itemDescription")}
          />
          {errors.itemDescription && <p className="mt-1 text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
        </section>

        {/* Locations (map) */}
        <section>
          <h2 className="mb-2 font-display text-sm font-semibold" style={{ color: exp.accent }}>
            {t("exp.locationTitle")}
          </h2>
          <LocationPicker accent={exp.accent} pickup={pickup} delivery={delivery} onChange={(w, p) => (w === "pickup" ? setPickup(p) : setDelivery(p))} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input className={cn(inputCls)} style={focusRing} placeholder={t("orderForm.pickupLandmark")} {...register("pickupLandmark")} />
            <input className={cn(inputCls)} style={focusRing} placeholder={t("orderForm.deliveryLandmark")} {...register("deliveryLandmark")} />
          </div>
        </section>

        {/* Price chip */}
        <div
          className="flex items-center justify-between rounded-2xl border p-4"
          style={{ borderColor: dominantTier ? `${TIER_META[dominantTier].hex}66` : "#271a44", backgroundColor: dominantTier ? `${TIER_META[dominantTier].hex}14` : "transparent" }}
        >
          <div>
            <p className="text-xs text-mist-500">{t("exp.priceEstimate")}</p>
            {estimatedFee != null ? (
              <p className="font-display text-xl font-bold" style={{ color: dominantTier ? TIER_META[dominantTier].hex : "#d4af37" }}>
                {formatXaf(estimatedFee)}
              </p>
            ) : (
              <p className="text-sm text-mist-400">{t("exp.setLocations")}</p>
            )}
          </div>
          {dominantTier && (
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${TIER_META[dominantTier].hex}22`, color: TIER_META[dominantTier].hex }}>
              {locale === "fr" ? TIER_META[dominantTier].labelFr : TIER_META[dominantTier].label}
            </span>
          )}
        </div>

        {/* Details */}
        <section className="flex flex-col gap-4 rounded-2xl border border-ink-700 bg-ink-900/40 p-4">
          <h2 className="font-display text-sm font-semibold" style={{ color: exp.accent }}>{t("exp.detailsTitle")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("orderForm.quantity")}</label>
              <input className={inputCls} style={focusRing} type="number" min={1} {...register("quantity")} />
            </div>
            <div>
              <label className={labelCls}>{t("orderForm.declaredValue")}</label>
              <input className={inputCls} style={focusRing} type="number" min={0} step={100} {...register("declaredValueXaf")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "isFragile" as const, label: t("orderForm.isFragile") },
              { key: "needsTemperatureCare" as const, label: t("orderForm.needsTemperatureCare") },
              { key: "isMedicine" as const, label: t("orderForm.isMedicine") },
              { key: "itemAlreadyPaid" as const, label: t("orderForm.itemAlreadyPaid") },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setValue(key, !watch(key))}
                className={cn("rounded-xl border px-3 py-2 text-xs font-medium transition-colors", watch(key) ? "border-transparent text-ink-950" : "border-ink-700 bg-ink-800 text-mist-400")}
                style={watch(key) ? { backgroundColor: exp.accent } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
          {isMedicine && (
            <div>
              <label className={labelCls}>{t("orderForm.prescriptionRequired")}</label>
              <div className="flex gap-2">
                {(["YES", "NO", "NOT_SURE"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setValue("prescriptionRequired", v)}
                    className={cn("flex-1 rounded-xl border px-2 py-2 text-xs font-medium", watch("prescriptionRequired") === v ? "border-transparent text-ink-950" : "border-ink-700 bg-ink-800 text-mist-400")}
                    style={watch("prescriptionRequired") === v ? { backgroundColor: exp.accent } : undefined}>
                    {v === "YES" ? t("common.yes") : v === "NO" ? t("common.no") : t("common.notSure")}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input className={inputCls} style={focusRing} placeholder={t("orderForm.preferredDeliveryTime")} {...register("preferredDeliveryTime")} />
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-800 px-3 py-3 text-sm", uploadedName ? "text-safe" : "text-mist-500")}>
            <ImageUp className="h-5 w-5" />
            {uploading ? t("orderForm.uploading") : uploadedName ? `${t("orderForm.uploaded")}: ${uploadedName}` : t("orderForm.uploadImage")}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </section>

        {/* Your info */}
        <section className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900/40 p-4">
          <h2 className="font-display text-sm font-semibold" style={{ color: exp.accent }}>{t("orderForm.customerSection")}</h2>
          <div>
            <label className={labelCls}>{t("orderForm.fullName")}</label>
            <input className={inputCls} style={focusRing} autoComplete="name" {...register("fullName")} />
            {errors.fullName && <p className="mt-1 text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
          </div>
          <div>
            <label className={labelCls}>{t("orderForm.whatsappNumber")}</label>
            <input className={inputCls} style={focusRing} inputMode="tel" placeholder="+237 6XX XXX XXX" autoComplete="tel" {...register("whatsappNumber")} />
            {errors.whatsappNumber && <p className="mt-1 text-xs text-restricted">{t("orderForm.fillRequired")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("orderForm.preferredLanguage")}</label>
              <select className={inputCls} style={focusRing} {...register("preferredLanguage")}>
                <option value="EN">English</option>
                <option value="FR">Français</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("orderForm.alternativePhone")}</label>
              <input className={inputCls} style={focusRing} inputMode="tel" {...register("alternativePhone")} />
            </div>
          </div>
        </section>

        {/* Payment method */}
        <section className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900/40 p-4">
          <h2 className="font-display text-sm font-semibold" style={{ color: exp.accent }}>{t("orderForm.paymentSection")}</h2>
          <div className="flex gap-2">
            {(["MTN_MOMO", "ORANGE_MONEY"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setValue("paymentMethod", v)}
                className={cn("flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold", watch("paymentMethod") === v ? "border-transparent text-ink-950" : "border-ink-700 bg-ink-800 text-mist-400")}
                style={watch("paymentMethod") === v ? { backgroundColor: exp.accent } : undefined}>
                {v === "MTN_MOMO" ? t("orderForm.mtnMomo") : t("orderForm.orangeMoney")}
              </button>
            ))}
          </div>
          <p className="rounded-xl border border-violet-700/40 bg-violet-950/40 p-3 text-xs font-medium text-violet-300">{t("orderForm.paymentSecurityNote")}</p>
        </section>

        {/* Terms + submit */}
        <label className="flex items-start gap-3 text-sm text-mist-300">
          <input type="checkbox" className="mt-1 h-4 w-4" style={{ accentColor: exp.accent }} checked={acceptedTerms === true}
            onChange={(e) => setValue("acceptedTerms", (e.target.checked ? true : undefined) as unknown as true)} />
          {t("orderForm.acceptTerms")}
        </label>
        {errors.acceptedTerms && <p className="text-xs text-restricted">{t("orderForm.fillRequired")}</p>}

        <Button type="submit" size="lg" disabled={acceptedTerms !== true} style={{ background: exp.accent, color: "#0a0710" }}>
          {t("exp.continue")} <ArrowRight className="h-5 w-5" />
        </Button>

        <div className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4 text-xs leading-relaxed text-gold-200">
          {getDisclaimer(locale)}
        </div>
      </div>
    </form>
  );
}

export function OrderForm({ merchants }: { merchants: MerchantOption[] }) {
  return (
    <Suspense>
      <OrderFormInner merchants={merchants} />
    </Suspense>
  );
}
