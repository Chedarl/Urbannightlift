"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import { Stepper } from "@/components/customer/order/Stepper";
import { ServiceSection } from "@/components/customer/order/ServiceSection";
import { LocationField } from "@/components/customer/location/LocationField";
import { MedicineForm } from "@/components/customer/order/forms/MedicineForm";
import { FoodForm } from "@/components/customer/order/forms/FoodForm";
import { GroceryForm } from "@/components/customer/order/forms/GroceryForm";
import { ParcelForm } from "@/components/customer/order/forms/ParcelForm";
import { ErrandForm } from "@/components/customer/order/forms/ErrandForm";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { Button } from "@/components/shared/Button";
import { formatXaf, cn } from "@/lib/utils";
import type { PickedPoint } from "@/components/customer/LocationPicker";
import type { MerchantCategory, ServiceType } from "@prisma/client";

/** Per-service pickup/delivery field labels (bilingual), reusing one picker. */
const LOC_LABELS: Record<ServiceType, { pickup: { en: string; fr: string }; delivery: { en: string; fr: string } }> = {
  FOOD_PICKUP: { pickup: { en: "Restaurant / vendor location", fr: "Lieu du restaurant / vendeur" }, delivery: { en: "Delivery location", fr: "Lieu de livraison" } },
  MEDICINE_PICKUP: { pickup: { en: "Pharmacy location", fr: "Lieu de la pharmacie" }, delivery: { en: "Delivery location", fr: "Lieu de livraison" } },
  GROCERY_PICKUP: { pickup: { en: "Store / market location", fr: "Lieu du magasin / marché" }, delivery: { en: "Delivery location", fr: "Lieu de livraison" } },
  SMALL_PARCEL: { pickup: { en: "Sender pickup location", fr: "Lieu de ramassage (expéditeur)" }, delivery: { en: "Receiver drop-off location", fr: "Lieu de dépôt (destinataire)" } },
  URGENT_ITEM: { pickup: { en: "Urgent pickup location", fr: "Lieu de ramassage urgent" }, delivery: { en: "Urgent delivery location", fr: "Lieu de livraison urgent" } },
  CUSTOM_ERRAND: { pickup: { en: "Starting location", fr: "Point de départ" }, delivery: { en: "Destination", fr: "Destination" } },
  MERCHANT_DELIVERY: { pickup: { en: "Merchant location", fr: "Lieu du commerçant" }, delivery: { en: "Customer delivery location", fr: "Lieu de livraison client" } },
};

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
  const [zones, setZones] = useState<{ id: string; zoneName: string; tier: ZoneTier; feeXaf: number; medicineFeeXaf: number }[]>([]);
  const [pickupSel, setPickupSel] = useState<SelectedLocation | null>(null);
  const [deliverySel, setDeliverySel] = useState<SelectedLocation | null>(null);
  const [sameLocError, setSameLocError] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [blockedNotice, setBlockedNotice] = useState(false);

  useEffect(() => {
    fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {});
  }, []);

  const {
    register, handleSubmit, watch, setValue, control,
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
  const deliveryZoneId = watch("deliveryZoneId");
  const pickupZoneId = watch("pickupZoneId");

  // Resolve the effective zone from the map pin first, else the dropdown.
  const effDeliveryZone = useMemo(() => {
    if (delivery?.zoneId) return { id: delivery.zoneId, feeXaf: delivery.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (delivery.tier ?? "GREEN") as ZoneTier };
    const z = zones.find((z) => z.id === deliveryZoneId);
    return z ? { id: z.id, feeXaf: z.feeXaf, medicineFeeXaf: z.medicineFeeXaf, nightUrgencyFeeXaf: 0, tier: z.tier } : null;
  }, [delivery, deliveryZoneId, zones]);

  const effPickupZone = useMemo(() => {
    if (pickup?.zoneId) return { id: pickup.zoneId, feeXaf: pickup.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (pickup.tier ?? "GREEN") as ZoneTier };
    const z = zones.find((z) => z.id === pickupZoneId);
    return z ? { id: z.id, feeXaf: z.feeXaf, medicineFeeXaf: z.medicineFeeXaf, nightUrgencyFeeXaf: 0, tier: z.tier } : null;
  }, [pickup, pickupZoneId, zones]);

  const estimatedFee = useMemo(
    () => estimateDeliveryFee(effPickupZone, effDeliveryZone, { isMedicine }),
    [effPickupZone, effDeliveryZone, isMedicine]
  );

  const dominantTier: ZoneTier | null = effDeliveryZone?.tier ?? effPickupZone?.tier ?? null;

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

  // Apply a confirmed picker selection → pricing state + registered form fields.
  function applySelection(which: "pickup" | "delivery", loc: SelectedLocation | null) {
    const point: PickedPoint | null = loc
      ? { lat: loc.latitude, lng: loc.longitude, label: loc.primaryName, zoneId: loc.zoneId, zoneName: loc.zoneName, tier: loc.tier, feeXaf: loc.feeXaf }
      : null;
    const landmark = loc ? [loc.landmark, loc.directions].filter(Boolean).join(" — ") : "";
    const locationText = loc ? `${loc.primaryName}${loc.neighbourhood ? ` — ${loc.neighbourhood}` : ""}` : "";
    if (which === "pickup") {
      setPickupSel(loc);
      setPickup(point);
      setValue("pickupLocation", locationText, { shouldValidate: true });
      setValue("pickupLandmark", landmark);
      setValue("pickupZoneId", loc?.zoneId ?? "");
      setValue("pickupLat", loc?.latitude ?? null);
      setValue("pickupLng", loc?.longitude ?? null);
    } else {
      setDeliverySel(loc);
      setDelivery(point);
      setValue("deliveryLocation", locationText, { shouldValidate: true });
      setValue("deliveryLandmark", landmark);
      setValue("deliveryZoneId", loc?.zoneId ?? "");
      setValue("deliveryLat", loc?.latitude ?? null);
      setValue("deliveryLng", loc?.longitude ?? null);
    }
    setSameLocError(false);
  }
  const applyPickup = (loc: SelectedLocation | null) => applySelection("pickup", loc);
  const applyDelivery = (loc: SelectedLocation | null) => applySelection("delivery", loc);

  function onSubmit(data: OrderInput) {
    setMissing([]);
    setBlockedNotice(false);
    // Guard: pickup and delivery must not be the same confirmed point.
    if (pickupSel && deliverySel && Math.abs(pickupSel.latitude - deliverySel.latitude) < 1e-4 && Math.abs(pickupSel.longitude - deliverySel.longitude) < 1e-4) {
      setSameLocError(true);
      document.querySelector("form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Guard: never accept a blocked/unavailable location.
    for (const sel of [pickupSel, deliverySel]) {
      if (sel && SERVICE_STATUS_META[sel.serviceStatus] && !SERVICE_STATUS_META[sel.serviceStatus].ok) {
        setBlockedNotice(true);
        return;
      }
    }

    const pickupLoc = selectedMerchant
      ? `${selectedMerchant.merchantName} — ${selectedMerchant.address}`
      : data.pickupLocation;

    const merged: OrderInput = {
      ...data,
      pickupLocation: pickupLoc,
      pickupLandmark: selectedMerchant?.landmark ?? data.pickupLandmark ?? "",
      merchantId: selectedMerchant?.id ?? "",
      pickupZoneId: effPickupZone?.id ?? "",
      deliveryZoneId: effDeliveryZone?.id ?? "",
      pickupLat: pickup?.lat ?? null,
      pickupLng: pickup?.lng ?? null,
      deliveryLat: delivery?.lat ?? null,
      deliveryLng: delivery?.lng ?? null,
    };

    saveDraft({
      ...merged,
      estimatedFeeXaf: estimatedFee,
      pickupZoneName: pickup?.zoneName ?? zones.find((z) => z.id === effPickupZone?.id)?.zoneName ?? undefined,
      deliveryZoneName: delivery?.zoneName ?? zones.find((z) => z.id === effDeliveryZone?.id)?.zoneName ?? undefined,
      merchantName: selectedMerchant?.merchantName,
    });
    router.push("/order/review");
  }

  function onInvalid(errs: typeof errors) {
    // Build a plain-language list of what still needs attention so the user is
    // never stuck on a silent submit.
    const labelFor: Partial<Record<keyof OrderInput, string>> = {
      fullName: t("orderForm.fullName"),
      whatsappNumber: t("orderForm.whatsappNumber"),
      itemDescription: t("exp.detailsTitle"),
      pickupLocation: LOC_LABELS[service].pickup[locale === "fr" ? "fr" : "en"],
      deliveryLocation: LOC_LABELS[service].delivery[locale === "fr" ? "fr" : "en"],
      quantity: t("orderForm.quantity"),
      declaredValueXaf: t("orderForm.declaredValue"),
      acceptedTerms: t("orderForm.acceptTerms"),
    };
    const list = (Object.keys(errs) as (keyof OrderInput)[])
      .map((k) => labelFor[k])
      .filter((v): v is string => Boolean(v));
    setMissing(list.length ? list : [t("orderForm.fillRequired")]);
    const el = document.querySelector("[data-error='true']") || document.querySelector("form");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const merchantLayout = exp.layout === "merchant";
  const focusRing = { "--tw-ring-color": `${exp.accent}66` } as React.CSSProperties;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="mx-auto max-w-lg pb-28" noValidate>
      <Stepper current={1} />
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
                  onClick={() => {
                    const next = selectedMerchant?.id === m.id ? null : m;
                    setSelectedMerchant(next);
                    setValue("pickupLocation", next ? `${next.merchantName} — ${next.address}` : "", { shouldValidate: true });
                    setValue("pickupLandmark", next?.landmark ?? "");
                  }}
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

        {/* Service-specific fields — genuinely different per service */}
        <ServiceSection
          service={service}
          exp={exp}
          control={control}
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          t={t}
          locale={locale === "fr" ? "fr" : "en"}
          inputCls={inputCls}
          labelCls={labelCls}
          focusRing={focusRing}
          uploadedName={uploadedName}
          uploading={uploading}
          handleFile={handleFile}
        />

        {/* Locations — citywide Yaoundé search / browse / GPS / map picker */}
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-semibold" style={{ color: exp.accent }}>
            {t("exp.locationTitle")}
          </h2>

          {!merchantLayout && (
            <LocationField
              label={LOC_LABELS[service].pickup[locale === "fr" ? "fr" : "en"]}
              accent={exp.accent}
              value={pickupSel}
              error={!!errors.pickupLocation}
              onChange={applyPickup}
            />
          )}

          <LocationField
            label={LOC_LABELS[service].delivery[locale === "fr" ? "fr" : "en"]}
            accent={exp.accent}
            value={deliverySel}
            error={!!errors.deliveryLocation}
            onChange={applyDelivery}
          />

          {sameLocError && (
            <p className="text-xs text-restricted">{locale === "fr" ? "Le ramassage et la livraison ne peuvent pas être identiques." : "Pickup and delivery cannot be the same location."}</p>
          )}
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
          <div className="flex flex-wrap gap-2">
            {(["MTN_MOMO", "ORANGE_MONEY", "CASH"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setValue("paymentMethod", v)}
                className={cn("min-w-[30%] flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold", watch("paymentMethod") === v ? "border-transparent text-ink-950" : "border-ink-700 bg-ink-800 text-mist-400")}
                style={watch("paymentMethod") === v ? { backgroundColor: exp.accent } : undefined}>
                {v === "MTN_MOMO" ? t("orderForm.mtnMomo") : v === "ORANGE_MONEY" ? t("orderForm.orangeMoney") : t("orderForm.cashOnDelivery")}
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
        {errors.acceptedTerms && <p className="text-xs text-restricted">{locale === "fr" ? "Veuillez accepter les conditions." : "Please accept the terms."}</p>}

        {/* What still needs attention (so the CTA never fails silently) */}
        {(missing.length > 0 || blockedNotice) && (
          <div data-error="true" className="rounded-2xl border border-restricted/40 bg-restricted/10 p-4 text-sm text-restricted">
            {blockedNotice ? (
              <p>{locale === "fr" ? "Un lieu sélectionné n'est pas desservi. Veuillez en choisir un autre." : "A selected location isn't serviceable. Please choose another."}</p>
            ) : (
              <>
                <p className="mb-1 font-semibold">{locale === "fr" ? "À compléter avant de continuer :" : "Please complete before continuing:"}</p>
                <ul className="list-disc pl-5 text-xs">
                  {missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4 text-xs leading-relaxed text-gold-200">
          {getDisclaimer(locale)}
        </div>
      </div>

      {/* Sticky "Review order summary" CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-950/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-mist-500">{t("exp.priceEstimate")}</p>
            <p className="truncate font-display text-lg font-bold" style={{ color: dominantTier ? TIER_META[dominantTier].hex : "#d4af37" }}>
              {estimatedFee != null ? formatXaf(estimatedFee) : "—"}
            </p>
          </div>
          <Button type="submit" size="lg" className="ml-auto shrink-0" style={{ background: exp.accent, color: "#0a0710" }}>
            {t("exp.reviewSummary")} <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Dispatch to a bespoke per-service form where one exists, else the shared engine. */
function OrderFormDispatch({ merchants }: { merchants: MerchantOption[] }) {
  const searchParams = useSearchParams();
  const service = (SERVICE_TYPES as string[]).includes(searchParams.get("service") ?? "")
    ? (searchParams.get("service") as ServiceType)
    : "FOOD_PICKUP";
  if (service === "MEDICINE_PICKUP") return <MedicineForm />;
  if (service === "FOOD_PICKUP") return <FoodForm />;
  if (service === "GROCERY_PICKUP") return <GroceryForm />;
  if (service === "SMALL_PARCEL") return <ParcelForm />;
  if (service === "CUSTOM_ERRAND") return <ErrandForm />;
  return <OrderFormInner merchants={merchants} />;
}

export function OrderForm({ merchants }: { merchants: MerchantOption[] }) {
  return (
    <Suspense>
      <OrderFormDispatch merchants={merchants} />
    </Suspense>
  );
}
