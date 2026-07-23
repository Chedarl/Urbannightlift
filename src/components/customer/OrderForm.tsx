"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getDisclaimer } from "@/lib/i18n/legal";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee, type ZonePricing } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { Button } from "@/components/shared/Button";
import { formatXaf, cn } from "@/lib/utils";
import type { MerchantCategory, SafetyLevel, ServiceType } from "@prisma/client";

export interface ZoneOption extends ZonePricing {
  zoneName: string;
  safetyLevel: SafetyLevel;
}

export interface MerchantOption {
  id: string;
  merchantName: string;
  category: MerchantCategory;
  address: string;
  landmark: string | null;
  openingHours: string | null;
}

const SERVICE_TYPES: ServiceType[] = [
  "FOOD_PICKUP",
  "MEDICINE_PICKUP",
  "GROCERY_PICKUP",
  "SMALL_PARCEL",
  "URGENT_ITEM",
  "CUSTOM_ERRAND",
  "MERCHANT_DELIVERY",
];

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-mist-300";
const sectionCls = "rounded-2xl border border-ink-700 bg-ink-900 p-4";

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="text-gold-400"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-mist-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-restricted">{error}</p>}
    </div>
  );
}

function YesNo({
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="flex gap-2">
      {[
        { v: true, label: yesLabel },
        { v: false, label: noLabel },
      ].map(({ v, label }) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
            value === v
              ? "border-violet-500 bg-violet-600/25 text-violet-300"
              : "border-ink-700 bg-ink-800 text-mist-500 hover:text-mist-300"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OrderFormInner({ zones, merchants }: { zones: ZoneOption[]; merchants: MerchantOption[] }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialService = (SERVICE_TYPES as string[]).includes(searchParams.get("service") ?? "")
    ? (searchParams.get("service") as ServiceType)
    : "FOOD_PICKUP";

  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [pickupMode, setPickupMode] = useState<"merchant" | "custom">(
    initialService === "MERCHANT_DELIVERY" && merchants.length > 0 ? "merchant" : "custom"
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema) as Resolver<OrderInput>,
    defaultValues: {
      preferredLanguage: locale === "fr" ? "FR" : "EN",
      serviceType: initialService,
      quantity: 1,
      declaredValueXaf: 0,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: initialService === "MEDICINE_PICKUP",
      prescriptionRequired: undefined,
      paymentMethod: "MTN_MOMO",
      acceptedTerms: undefined as unknown as true,
    },
  });

  const serviceType = watch("serviceType");
  const isMedicine = watch("isMedicine");
  const pickupZoneId = watch("pickupZoneId");
  const deliveryZoneId = watch("deliveryZoneId");
  const merchantId = watch("merchantId");
  const acceptedTerms = watch("acceptedTerms");

  const pickupZone = zones.find((z) => z.id === pickupZoneId) ?? null;
  const deliveryZone = zones.find((z) => z.id === deliveryZoneId) ?? null;
  const selectedMerchant = merchants.find((m) => m.id === merchantId) ?? null;

  const estimatedFee = useMemo(
    () => estimateDeliveryFee(pickupZone, deliveryZone, { isMedicine }),
    [pickupZone, deliveryZone, isMedicine]
  );

  const zoneWarning =
    pickupZone?.safetyLevel === "RESTRICTED" ||
    pickupZone?.safetyLevel === "NO_GO" ||
    deliveryZone?.safetyLevel === "RESTRICTED" ||
    deliveryZone?.safetyLevel === "NO_GO";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "order-screenshots", fileName: file.name }),
      });
      if (!res.ok) throw new Error("upload init failed");
      const { signedUrl, path } = await res.json();
      const put = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("upload failed");
      setValue("screenshotUrl", path);
      setUploadedName(file.name);
    } catch {
      setUploadedName(null);
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(data: OrderInput) {
    // Merchant pickup pre-fills the pickup location server-side too.
    const merged: OrderInput =
      pickupMode === "merchant" && selectedMerchant
        ? {
            ...data,
            pickupLocation: `${selectedMerchant.merchantName} — ${selectedMerchant.address}`,
            pickupLandmark: selectedMerchant.landmark ?? "",
          }
        : { ...data, merchantId: "" };

    saveDraft({
      ...merged,
      estimatedFeeXaf: estimatedFee,
      pickupZoneName: pickupZone?.zoneName,
      deliveryZoneName: deliveryZone?.zoneName,
      merchantName: pickupMode === "merchant" ? selectedMerchant?.merchantName : undefined,
    });
    router.push("/order/review");
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-16 pt-8"
      noValidate
    >
      <h1 className="font-display text-2xl font-bold">{t("orderForm.title")}</h1>

      {/* ---- Customer info ---- */}
      <section className={sectionCls}>
        <h2 className="mb-4 font-display text-base font-semibold text-gold-300">
          {t("orderForm.customerSection")}
        </h2>
        <div className="flex flex-col gap-4">
          <Field label={t("orderForm.fullName")} required error={errors.fullName && t("orderForm.fillRequired")}>
            <input className={inputCls} {...register("fullName")} autoComplete="name" />
          </Field>
          <Field
            label={t("orderForm.whatsappNumber")}
            hint={t("orderForm.whatsappHint")}
            required
            error={errors.whatsappNumber && t("orderForm.fillRequired")}
          >
            <input
              className={inputCls}
              {...register("whatsappNumber")}
              inputMode="tel"
              placeholder="+237 6XX XXX XXX"
              autoComplete="tel"
            />
          </Field>
          <Field label={t("orderForm.preferredLanguage")}>
            <select className={inputCls} {...register("preferredLanguage")}>
              <option value="EN">English</option>
              <option value="FR">Français</option>
            </select>
          </Field>
          <Field label={`${t("orderForm.alternativePhone")} (${t("common.optional")})`}>
            <input className={inputCls} {...register("alternativePhone")} inputMode="tel" />
          </Field>
        </div>
      </section>

      {/* ---- Order info ---- */}
      <section className={sectionCls}>
        <h2 className="mb-4 font-display text-base font-semibold text-gold-300">
          {t("orderForm.orderSection")}
        </h2>
        <div className="flex flex-col gap-4">
          <Field label={t("orderForm.serviceType")} required>
            <select className={inputCls} {...register("serviceType")}>
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {t(`services.${s}.name`)}
                </option>
              ))}
            </select>
          </Field>

          {/* Merchant or custom pickup */}
          {merchants.length > 0 && (
            <Field label={t("orderForm.merchantPickup")}>
              <div className="flex gap-2">
                {(
                  [
                    { mode: "merchant", label: t("orderForm.verifiedMerchant") },
                    { mode: "custom", label: t("orderForm.customPickup") },
                  ] as const
                ).map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPickupMode(mode)}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      pickupMode === mode
                        ? "border-gold-400 bg-gold-400/10 text-gold-300"
                        : "border-ink-700 bg-ink-800 text-mist-500 hover:text-mist-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {pickupMode === "merchant" ? (
            <Field label={t("orderForm.selectMerchant")} required>
              <select className={inputCls} {...register("merchantId")}>
                <option value="">—</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.merchantName} ({t(`admin.merchants.categories.${m.category}`)})
                  </option>
                ))}
              </select>
              {selectedMerchant && (
                <p className="mt-1 text-xs text-mist-500">
                  {selectedMerchant.address}
                  {selectedMerchant.openingHours ? ` • ${selectedMerchant.openingHours}` : ""}
                </p>
              )}
            </Field>
          ) : (
            <>
              <Field
                label={t("orderForm.pickupLocation")}
                required
                error={errors.pickupLocation && t("orderForm.fillRequired")}
              >
                <input className={inputCls} {...register("pickupLocation")} />
              </Field>
              <Field label={`${t("orderForm.pickupLandmark")} (${t("common.optional")})`}>
                <input className={inputCls} {...register("pickupLandmark")} />
              </Field>
            </>
          )}

          <Field label={t("orderForm.pickupZone")}>
            <select className={inputCls} {...register("pickupZoneId")}>
              <option value="">{t("orderForm.zoneOther")}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.zoneName}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={t("orderForm.deliveryLocation")}
            required
            error={errors.deliveryLocation && t("orderForm.fillRequired")}
          >
            <input className={inputCls} {...register("deliveryLocation")} />
          </Field>
          <Field label={`${t("orderForm.deliveryLandmark")} (${t("common.optional")})`}>
            <input className={inputCls} {...register("deliveryLandmark")} />
          </Field>
          <Field label={t("orderForm.deliveryZone")}>
            <select className={inputCls} {...register("deliveryZoneId")}>
              <option value="">{t("orderForm.zoneOther")}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.zoneName}
                </option>
              ))}
            </select>
          </Field>

          {zoneWarning && (
            <div className="flex items-start gap-2 rounded-xl border border-restricted/40 bg-restricted/10 p-3 text-xs text-restricted">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {t("orderForm.restrictedZoneWarning")}
            </div>
          )}

          <Field
            label={t("orderForm.itemDescription")}
            required
            error={errors.itemDescription && t("orderForm.fillRequired")}
          >
            <textarea className={cn(inputCls, "min-h-20 resize-y")} {...register("itemDescription")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("orderForm.quantity")} required>
              <input className={inputCls} type="number" min={1} {...register("quantity")} />
            </Field>
            <Field label={t("orderForm.declaredValue")} required>
              <input className={inputCls} type="number" min={0} step={100} {...register("declaredValueXaf")} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-mist-500">{t("orderForm.declaredValueHint")}</p>

          <Field
            label={`${t("orderForm.preferredDeliveryTime")} (${t("common.optional")})`}
            hint={t("orderForm.preferredDeliveryTimeHint")}
          >
            <input className={inputCls} {...register("preferredDeliveryTime")} placeholder="21:30" />
          </Field>

          <Field label={`${t("orderForm.specialInstructions")} (${t("common.optional")})`}>
            <textarea className={cn(inputCls, "min-h-16 resize-y")} {...register("specialInstructions")} />
          </Field>

          {/* Yes/No toggles */}
          <Field label={t("orderForm.itemAlreadyPaid")}>
            <YesNo
              value={watch("itemAlreadyPaid")}
              onChange={(v) => setValue("itemAlreadyPaid", v)}
              yesLabel={t("common.yes")}
              noLabel={t("common.no")}
            />
          </Field>
          <Field label={t("orderForm.riderPaysAtPickup")}>
            <YesNo
              value={watch("riderPaysAtPickup")}
              onChange={(v) => setValue("riderPaysAtPickup", v)}
              yesLabel={t("common.yes")}
              noLabel={t("common.no")}
            />
          </Field>
          <Field label={t("orderForm.isFragile")}>
            <YesNo
              value={watch("isFragile")}
              onChange={(v) => setValue("isFragile", v)}
              yesLabel={t("common.yes")}
              noLabel={t("common.no")}
            />
          </Field>
          <Field label={t("orderForm.needsTemperatureCare")}>
            <YesNo
              value={watch("needsTemperatureCare")}
              onChange={(v) => setValue("needsTemperatureCare", v)}
              yesLabel={t("common.yes")}
              noLabel={t("common.no")}
            />
          </Field>
          <Field label={t("orderForm.isMedicine")}>
            <YesNo
              value={isMedicine}
              onChange={(v) => setValue("isMedicine", v)}
              yesLabel={t("common.yes")}
              noLabel={t("common.no")}
            />
          </Field>

          {isMedicine && (
            <Field label={t("orderForm.prescriptionRequired")}>
              <div className="flex gap-2">
                {(
                  [
                    { v: "YES", label: t("common.yes") },
                    { v: "NO", label: t("common.no") },
                    { v: "NOT_SURE", label: t("common.notSure") },
                  ] as const
                ).map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValue("prescriptionRequired", v)}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      watch("prescriptionRequired") === v
                        ? "border-violet-500 bg-violet-600/25 text-violet-300"
                        : "border-ink-700 bg-ink-800 text-mist-500 hover:text-mist-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label={`${t("orderForm.uploadImage")} (${t("common.optional")})`} hint={t("orderForm.uploadImageHint")}>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-700 bg-ink-800 px-3 py-3 text-sm",
                uploadedName ? "text-safe" : "text-mist-500 hover:border-violet-500"
              )}
            >
              <ImageUp className="h-5 w-5" />
              {uploading
                ? t("orderForm.uploading")
                : uploadedName
                  ? `${t("orderForm.uploaded")}: ${uploadedName}`
                  : t("orderForm.uploadImage")}
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </label>
          </Field>
        </div>
      </section>

      {/* ---- Payment ---- */}
      <section className={sectionCls}>
        <h2 className="mb-4 font-display text-base font-semibold text-gold-300">
          {t("orderForm.paymentSection")}
        </h2>
        <div className="flex flex-col gap-4">
          <Field label={t("orderForm.paymentMethod")} required>
            <div className="flex gap-2">
              {(
                [
                  { v: "MTN_MOMO", label: t("orderForm.mtnMomo") },
                  { v: "ORANGE_MONEY", label: t("orderForm.orangeMoney") },
                ] as const
              ).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValue("paymentMethod", v)}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                    watch("paymentMethod") === v
                      ? "border-gold-400 bg-gold-400/10 text-gold-300"
                      : "border-ink-700 bg-ink-800 text-mist-500 hover:text-mist-300"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`${t("orderForm.paymentPhone")} (${t("common.optional")})`}>
            <input className={inputCls} {...register("paymentPhone")} inputMode="tel" />
          </Field>
          <Field label={`${t("orderForm.transactionReference")} (${t("common.optional")})`}>
            <input className={inputCls} {...register("transactionReference")} />
          </Field>
          <p className="text-xs text-mist-500">{t("orderForm.paymentStatusPending")}</p>
          <p className="rounded-xl border border-violet-700/40 bg-violet-950/40 p-3 text-xs font-medium text-violet-300">
            {t("orderForm.paymentSecurityNote")}
          </p>
          {estimatedFee != null && (
            <div className="flex items-center justify-between rounded-xl bg-ink-800 px-4 py-3">
              <span className="text-sm text-mist-300">{t("orderForm.estimatedFee")}</span>
              <span className="font-display text-lg font-bold text-gold-400">{formatXaf(estimatedFee)}</span>
            </div>
          )}
          <p className="text-xs text-mist-500">{t("orderForm.feeNote")}</p>
        </div>
      </section>

      {/* ---- Terms + submit ---- */}
      <label className="flex items-start gap-3 text-sm text-mist-300">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-gold-400"
          checked={acceptedTerms === true}
          onChange={(e) => setValue("acceptedTerms", (e.target.checked ? true : undefined) as unknown as true)}
        />
        {t("orderForm.acceptTerms")}
      </label>
      {errors.acceptedTerms && <p className="text-xs text-restricted">{t("orderForm.fillRequired")}</p>}

      <Button type="submit" size="lg" disabled={isSubmitting || acceptedTerms !== true}>
        {t("orderForm.continueToReview")}
      </Button>

      {/* Legal disclaimer — placed directly after the Send Order button (spec). */}
      <div className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4 text-xs leading-relaxed text-gold-200">
        {getDisclaimer(locale)}
      </div>
    </form>
  );
}

export function OrderForm(props: { zones: ZoneOption[]; merchants: MerchantOption[] }) {
  return (
    <Suspense>
      <OrderFormInner {...props} />
    </Suspense>
  );
}
