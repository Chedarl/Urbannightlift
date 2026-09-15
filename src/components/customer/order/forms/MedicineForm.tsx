"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Pill, ShieldCheck, FileText, User, Phone, Trash2,
  Plus, Minus, Upload, UserCheck, Repeat, Snowflake, MapPin, Banknote, ClipboardList,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { decideAutoPrice } from "@/lib/orders/autoPrice";
import { quoteDeliveryFee, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { LocationField } from "@/components/customer/location/LocationField";
import { useIntakePrefill, blank } from "@/lib/orders/intakePrefill";
import { MerchantField } from "@/components/customer/merchant/MerchantField";
import { PharmacyTonight } from "@/components/customer/pharmacy/PharmacyTonight";
import { TermsCheckbox } from "@/components/customer/order/fields/TermsCheckbox";
import { DeliveryTimeField } from "@/components/customer/order/fields/DeliveryTimeField";
import { SavedAddresses } from "@/components/customer/order/fields/SavedAddresses";
import { MoreDetails } from "@/components/customer/order/fields/MoreDetails";
import { SpendingCapField } from "@/components/customer/order/fields/SpendingCapField";
import { WelcomeBack } from "@/components/customer/order/fields/WelcomeBack";
import { VoiceNoteField } from "@/components/customer/order/fields/VoiceNoteField";
import { isRealName, localPhone, useProfilePrefill, useDeliverToAddress } from "@/lib/account/profile";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { cn } from "@/lib/utils";
import type { MerchantResult } from "@/app/api/merchants/search/route";
import type { BrowsePharmacy, ShelfItem } from "@/app/api/pharmacy/browse/route";
import { usePaymentMethods } from "@/lib/payments/usePaymentMethods";
import { CartBar } from "@/components/customer/order/CartBar";

/**
 * The dropped pin, when there is one.
 *
 * Passed into the fee so the price on screen is worked out from the same
 * distance the server will use. Without this the customer sees a zone-only
 * estimate and is charged something else, which is a worse bug than the one
 * this whole change is fixing.
 */
function pin(sel: SelectedLocation | null): { lat: number; lng: number } | null {
  return sel?.latitude != null && sel?.longitude != null
    ? { lat: sel.latitude, lng: sel.longitude }
    : null;
}

const ACCENT = "#2dd4bf";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const input = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-teal-400 focus:outline-none";

interface Med { name: string; dosage: string; qty: number }

export function MedicineForm() {
  const { locale } = useTranslation();
  // Never offer a way to pay that has no merchant code behind it.
  const payMethods = usePaymentMethods();
  const fr = locale === "fr";
  const router = useRouter();

  const [pickupSel, setPickupSel] = useState<SelectedLocation | null>(null);
  const [deliverySel, setDeliverySel] = useState<SelectedLocation | null>(null);
  // "Deliver here" from a portal saved-place tap (?deliverTo=…) — a real
  // shortcut, distinct from the plain Order tab.
  useDeliverToAddress((l) => applySel("delivery", l));
  const [zones, setZones] = useState<{ id: string; zoneName: string; tier: ZoneTier; feeXaf: number; medicineFeeXaf: number }[]>([]);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [merchant, setMerchant] = useState<MerchantResult | null>(null);
  const [pharmacyName, setPharmacyName] = useState("");
  // The bar is outside the field stack, so it asks the form to submit itself
  // rather than being a submit button that has to live inside it.
  const formRef = useRef<HTMLFormElement>(null);

  const { register, handleSubmit, watch, setValue, getValues, control } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema) as Resolver<OrderInput>,
    defaultValues: {
      preferredLanguage: fr ? "FR" : "EN",
      serviceType: "MEDICINE_PICKUP",
      quantity: 1,
      declaredValueXaf: 0,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: true,
      prescriptionRequired: "YES",
      paymentMethod: "CASH",
      acceptedTerms: undefined as unknown as true,
      serviceDetails: { prescriptionType: "PRESCRIPTION", substituteOk: true, meds: [{ name: "", dosage: "", qty: 1 }] },
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "serviceDetails.meds" as never });
  const sd = watch("serviceDetails") as Record<string, unknown> | undefined;
  const meds = (sd?.meds as Med[] | undefined) ?? [];
  const payment = watch("paymentMethod");
  const prescriptionType = (sd?.prescriptionType as string) ?? "PRESCRIPTION";

  useProfilePrefill((p) => {
    if (isRealName(p.fullName)) setValue("fullName", p.fullName);
    if (!getValues("whatsappNumber")) setValue("whatsappNumber", localPhone(p.whatsappNumber), { shouldValidate: true });
  });

  /*
   * What they typed in the intake box, if that is how they arrived. Only empty
   * boxes are filled, so nothing here can overwrite something they have already
   * corrected.
   */
  const intake = useIntakePrefill("MEDICINE_PICKUP");
  useEffect(() => {
    if (!intake) return;
    if (intake.pickupSuggestion) setPharmacyName((v) => (blank(v) ? intake.pickupSuggestion : v));
    if (intake.itemDescription && blank(getValues("serviceDetails.meds.0.name" as never)))
      setValue("serviceDetails.meds.0.name" as never, intake.itemDescription as never, { shouldValidate: true });
    if (intake.notes && blank(getValues("specialInstructions")))
      setValue("specialInstructions", intake.notes);
  }, [intake, getValues, setValue]);

  useEffect(() => {
    fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {});
  }, []);

  // Keep the required itemDescription synced from the medicine list.
  useEffect(() => {
    const text = meds.filter((m) => m?.name).map((m) => `${m.qty || 1}× ${m.name}${m.dosage ? ` (${m.dosage})` : ""}`).join(", ");
    if (text) setValue("itemDescription", text, { shouldValidate: true });
  }, [meds, setValue]);

  const effZone = (sel: SelectedLocation | null, zoneId?: string) =>
    sel?.zoneId ? { id: sel.zoneId, feeXaf: sel.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (sel.tier ?? "GREEN") as ZoneTier } :
    zones.find((z) => z.id === zoneId) ? (() => { const z = zones.find((z) => z.id === zoneId)!; return { id: z.id, feeXaf: z.feeXaf, medicineFeeXaf: z.medicineFeeXaf, nightUrgencyFeeXaf: 0, tier: z.tier }; })() : null;

  const fare = useMemo(
    () => quoteDeliveryFee(effZone(pickupSel), effZone(deliverySel), { isMedicine: true, pickup: pin(pickupSel), delivery: pin(deliverySel) }),
    [pickupSel, deliverySel, zones]
  );
  const estimatedFee = fare?.totalXaf ?? null;
  /**
   * Whether that fee is the final zone tariff, using the same rule the server
   * applies on submit. Wording only — the server re-decides authoritatively.
   */
  const priceFirm = useMemo(
    () =>
      decideAutoPrice({
        pickupZone: effZone(pickupSel),
        deliveryZone: effZone(deliverySel),
        estimatedFeeXaf: estimatedFee,
        highValueFlag: false,
        riskFlag: false,
      }).firm,
    [pickupSel, deliverySel, estimatedFee]
  );

  /**
   * Choosing a catalogued pharmacy also sets the pickup point, so the rider is
   * sent to a door rather than a name. The badge in the picker marks the
   * pharmacie de garde — the duty rotates weekly, so tonight's is the only one
   * worth riding to.
   */
  function pickMerchant(m: MerchantResult, loc: SelectedLocation) {
    setMerchant(m);
    setPharmacyName(m.merchantName);
    setValue("merchantId", m.id);
    setValue("serviceDetails.pharmacy" as never, m.merchantName as never);
    applySel("pickup", loc);
  }

  /**
   * The same selection, made by tapping the "open tonight" list instead of
   * typing a name into the search box. It has to land in exactly the same state
   * — merchantId, pharmacy name, pickup pin — or the two ways of choosing a
   * pharmacy would produce two different orders.
   */
  function pickBrowsed(p: BrowsePharmacy, loc: SelectedLocation | null) {
    setMerchant({
      id: p.id,
      merchantName: p.name,
      category: "PHARMACY",
      subcategory: null,
      neighbourhood: p.neighbourhood,
      address: p.address,
      landmark: p.landmark,
      latitude: p.latitude,
      longitude: p.longitude,
      zoneId: p.zoneId,
      openingHours: null,
      openNow: p.openNow,
      open24h: p.open24h,
      onDutyTonight: p.onDutyTonight,
      phone: p.phone,
      logoUrl: p.logoUrl,
      socialUrl: null,
      socialPlatform: null,
      productCount: p.shelf.length,
      distanceKm: null,
    });
    setPharmacyName(p.name);
    setValue("merchantId", p.id);
    setValue("serviceDetails.pharmacy" as never, p.name as never);
    // Verified but never pinned: the location field below appears again and
    // asks, rather than sending a rider to a name.
    if (loc) applySel("pickup", loc);
  }

  /**
   * A shelf item tapped. It fills a row in the medicine list the customer
   * already has — it does not open a cart, and it does not price the order.
   * The pharmacy's till decides the amount and the rider photographs the
   * receipt, the same as every other shopping service here.
   */
  function addShelfItem(it: ShelfItem) {
    const name = (fr && it.nameFr ? it.nameFr : it.name).slice(0, 80);
    const rows = meds;
    if (rows.some((m) => m?.name?.trim().toLowerCase() === name.toLowerCase())) return;

    const blank = rows.findIndex((m) => !m?.name?.trim());
    if (blank >= 0) {
      setValue(`serviceDetails.meds.${blank}.name` as never, name as never, { shouldValidate: true });
      setValue(`serviceDetails.meds.${blank}.dosage` as never, (it.unit ?? "") as never);
    } else {
      append({ name, dosage: it.unit ?? "", qty: 1 } as never);
    }
  }

  /** Not catalogued — keep the name and ask where it is. */
  function useTypedPharmacy(name: string) {
    setMerchant(null);
    setPharmacyName(name);
    setValue("merchantId", "");
    setValue("serviceDetails.pharmacy" as never, name as never);
  }

  function applySel(which: "pickup" | "delivery", loc: SelectedLocation | null) {
    const text = loc ? `${loc.primaryName}${loc.neighbourhood ? ` — ${loc.neighbourhood}` : ""}` : "";
    const landmark = loc ? [loc.landmark, loc.directions].filter(Boolean).join(" — ") : "";
    if (which === "pickup") {
      setPickupSel(loc);
      setValue("pickupLocation", text, { shouldValidate: true });
      setValue("pickupLandmark", landmark);
      setValue("pickupZoneId", loc?.zoneId ?? "");
      setValue("pickupLat", loc?.latitude ?? null);
      setValue("pickupLng", loc?.longitude ?? null);
    } else {
      setDeliverySel(loc);
      setValue("deliveryLocation", text, { shouldValidate: true });
      setValue("deliveryLandmark", landmark);
      setValue("deliveryZoneId", loc?.zoneId ?? "");
      setValue("deliveryLat", loc?.latitude ?? null);
      setValue("deliveryLng", loc?.longitude ?? null);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || file.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bucket: "order-screenshots", fileName: file.name }) });
      if (!res.ok) throw new Error();
      const { signedUrl, path } = await res.json();
      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      setValue("screenshotUrl", path);
      setUploadedName(file.name);
    } catch { setUploadedName(null); } finally { setUploading(false); }
  }

  function setQty(i: number, delta: number) {
    const cur = Number(meds[i]?.qty || 1);
    setValue(`serviceDetails.meds.${i}.qty` as never, Math.max(1, cur + delta) as never, { shouldValidate: true });
  }

  function onSubmit(data: OrderInput) {
    setMissing([]);
    for (const sel of [pickupSel, deliverySel]) {
      if (sel && SERVICE_STATUS_META[sel.serviceStatus] && !SERVICE_STATUS_META[sel.serviceStatus].ok) {
        setMissing([fr ? "Un lieu sélectionné n'est pas desservi." : "A selected location isn't serviceable."]);
        return;
      }
    }
    setValue("prescriptionRequired", prescriptionType === "PRESCRIPTION" ? "YES" : "NO");
    saveDraft({
      ...data,
      prescriptionRequired: prescriptionType === "PRESCRIPTION" ? "YES" : "NO",
      pickupLat: pickupSel?.latitude ?? null,
      pickupLng: pickupSel?.longitude ?? null,
      deliveryLat: deliverySel?.latitude ?? null,
      deliveryLng: deliverySel?.longitude ?? null,
      estimatedFeeXaf: estimatedFee, priceFirm,
      fareLines: fare?.lines, fareEstimated: fare?.estimated,
      pickupZoneName: pickupSel?.zoneName ?? undefined,
      deliveryZoneName: deliverySel?.zoneName ?? undefined,
    });
    router.push("/order/review");
  }

  function onInvalid(errs: Record<string, unknown>) {
    const labels: Record<string, string> = {
      goodsCapXaf: fr ? "Plafond de dépense" : "Spending cap",
      acceptedTerms: fr ? "Accepter les conditions" : "Accept the terms",
      fullName: fr ? "Nom du patient" : "Patient full name",
      whatsappNumber: fr ? "Téléphone du patient" : "Patient phone number",
      pickupLocation: fr ? "Lieu de la pharmacie" : "Pharmacy location",
      deliveryLocation: fr ? "Adresse de livraison" : "Delivery address",
      itemDescription: fr ? "Liste des médicaments" : "Medicine list",
    };
    setMissing(Object.keys(errs).map((k) => labels[k]).filter(Boolean) as string[]);
    document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const PhonePrefix = () => (
    <span className="flex shrink-0 items-center gap-1 rounded-l-xl border border-r-0 border-ink-700 bg-ink-800 px-2.5 text-sm text-mist-300">🇨🇲 +237</span>
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit, onInvalid)} className="mx-auto max-w-lg pb-32">
      {/* Just a way back.

          This row used to repeat the logo and the language switch that
          `CustomerHeader` has already drawn immediately above it — two brand
          bars stacked, about 120px of a 844px screen spent saying the same
          thing twice before the form begins. The food screen never had it,
          which is why that one always looked less cramped. */}
      <div className="px-4 pt-3">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="rounded-xl border border-ink-700 bg-ink-900/60 p-2 text-mist-300"><ArrowLeft className="h-5 w-5" /></button>
      </div>

      {/* Hero, cut down to a line.
          It was a 16-line gradient block with a 64px icon and a "Step 1 of 3"
          badge, on a screen whose real first question is one the customer can
          answer in a second. A title is a title; the fork below is the page. */}
      <div className="px-4 pb-3 pt-2">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold leading-tight">
          <Pill className="h-5 w-5 text-teal-300" />
          {fr ? "Pharmacie" : "Pharmacy"}
        </h1>
      </div>

      <div className="flex flex-col gap-4 px-4">
        <WelcomeBack accent={ACCENT} fr={fr} />

        {/*
          ══ The fork ══

          This was two 12px buttons inside a card called "Prescription type",
          sitting between a confidentiality banner and a name field. It is in
          fact the **first and largest** decision on the screen: it decides
          whether a prescription has to be photographed, whether a holder has to
          be named, and whether a pharmacist has to see anything at all. Half
          this form is irrelevant on one branch and mandatory on the other.

          So it is asked first, asked large, and it now actually *does*
          something: the prescription-only blocks below appear on one branch and
          are out of the way on the other. A customer buying paracetamol at
          1 a.m. should not scroll past an upload box and a "prescription
          holder" field to get there.
        */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              v: "OTC",
              icon: Pill,
              title: fr ? "Sans ordonnance" : "No prescription",
              sub: fr ? "Paracétamol, pansements…" : "Paracetamol, plasters…",
            },
            {
              v: "PRESCRIPTION",
              icon: FileText,
              title: fr ? "Sur ordonnance" : "On prescription",
              sub: fr ? "Photo de l'ordonnance" : "A photo of the script",
            },
          ].map((o) => {
            const on = prescriptionType === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setValue("serviceDetails.prescriptionType" as never, o.v as never)}
                aria-pressed={on}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors",
                  on
                    ? "border-teal-400 bg-teal-500/12"
                    : "border-ink-700 bg-ink-900/50 hover:border-ink-600"
                )}
              >
                <o.icon className={cn("h-6 w-6", on ? "text-teal-300" : "text-mist-500")} />
                <span
                  className={cn(
                    "font-display text-sm font-bold leading-tight",
                    on ? "text-teal-100" : "text-mist-200"
                  )}
                >
                  {o.title}
                </span>
                <span className="text-xs leading-snug text-mist-500">{o.sub}</span>
              </button>
            );
          })}
        </div>

        {/*
          The confidentiality line, moved and shrunk.

          It used to be a full banner at the top of every visit, including for
          somebody buying plasters. It belongs to the prescription branch — that
          is when a photograph of a medical document is about to be uploaded —
          and it says the one thing that actually reassures: where the photo does
          not go.
        */}
        {prescriptionType === "PRESCRIPTION" && (
          <p className="flex items-start gap-2 rounded-xl border border-teal-500/25 bg-teal-950/25 px-3 py-2.5 text-xs leading-relaxed text-teal-100">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-300" />
            {fr
              ? "Votre ordonnance reste privée : elle ne figure jamais dans le PDF partagé ni dans un lien public. Seuls le pharmacien et notre équipe la voient."
              : "Your prescription stays private: it never appears in the shared PDF or in any public link. Only the pharmacist and our team see it."}
          </p>
        )}

        <div className={card}>
          <p className={label}><User className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Nom complet du patient" : "Patient full name"}</p>
          <input className={cn(input, "mt-2")} placeholder={fr ? "ex. Jean Claude" : "e.g. Jean Claude"} data-error={missing.includes(fr ? "Nom du patient" : "Patient full name") ? "true" : undefined} {...register("fullName")} />
        </div>

        {/* Who is actually open, before we ask anyone to type a name. Renders
            nothing until pharmacies are verified, which is what an empty
            catalogue should look like. */}
        <PharmacyTonight
          fr={fr}
          accent={ACCENT}
          selectedId={merchant?.id ?? null}
          onPick={pickBrowsed}
          onAddItem={addShelfItem}
        />

        {/* Patient phone + pharmacy name */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={label}><Phone className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Téléphone du patient" : "Patient phone number"}</p>
            <div className="mt-2 flex">
              <PhonePrefix />
              <input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" {...register("whatsappNumber")} />
            </div>
          </div>
          <div className={card}>
            <MerchantField
              category="PHARMACY"
              accent={ACCENT}
              fr={fr}
              label={fr ? "Nom de la pharmacie" : "Pharmacy name"}
              placeholder={fr ? "ex. Pharmacie du Stade" : "e.g. Pharmacie du Stade"}
              value={pharmacyName}
              merchantId={merchant?.id ?? null}
              onPick={pickMerchant}
              onFreeText={useTypedPharmacy}
            />
          </div>
        </div>

        {/* Pharmacy location — only asked for when no catalogued pharmacy was
            chosen, since a chosen one already carries its own pin. */}
        {!merchant && (
          <div className={card}>
            <p className={cn(label, "mb-2")}><MapPin className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Lieu de la pharmacie" : "Pharmacy location"}</p>
            <LocationField mode="pickup" label={fr ? "Lieu de la pharmacie" : "Pharmacy location"} accent={ACCENT} value={pickupSel} error={missing.includes(fr ? "Lieu de la pharmacie" : "Pharmacy location")} onChange={(l) => applySel("pickup", l)} suggestion={intake?.pickupSuggestion} />
            <p className="mt-2 text-xs text-mist-500">
              {fr
                ? "Vous ne savez pas laquelle est ouverte ? Laissez vide — nous trouvons la pharmacie de garde la plus proche."
                : "Not sure which is open? Leave this and we'll find the nearest pharmacy on duty."}
            </p>
          </div>
        )}

        {/* Medicine list */}
        <div className={card}>
          <div className="mb-3 flex items-center gap-2">
            <Pill className="h-4 w-4 text-teal-300" />
            <p className="text-sm font-semibold text-mist-100">{fr ? "Liste des médicaments" : "Medicine list"}</p>
            <span className="text-xs text-mist-500">{fr ? "Ajoutez tous les médicaments" : "Add all medicines to be picked up"}</span>
          </div>
          <div className="hidden grid-cols-[1fr_1fr_auto_auto] gap-2 px-1 pb-1 text-xs text-mist-500 sm:grid">
            <span>{fr ? "Nom" : "Medicine name"}</span><span>{fr ? "Dosage" : "Dosage / Strength"}</span><span className="text-center">{fr ? "Qté" : "Quantity"}</span><span />
          </div>
          <div className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
                <input className={input} placeholder={fr ? "Paracétamol" : "Paracetamol"} {...register(`serviceDetails.meds.${i}.name` as never)} />
                <input className={input} placeholder="500mg" {...register(`serviceDetails.meds.${i}.dosage` as never)} />
                <div className="flex items-center rounded-xl border border-ink-700 bg-ink-800">
                  <button type="button" onClick={() => setQty(i, -1)} className="px-2 py-2 text-mist-400"><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center text-sm text-mist-100">{meds[i]?.qty || 1}</span>
                  <button type="button" onClick={() => setQty(i, 1)} className="px-2 py-2 text-teal-300"><Plus className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => remove(i)} className="p-1.5 text-mist-500 hover:text-restricted" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => append({ name: "", dosage: "", qty: 1 } as never)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-500/40 py-2.5 text-sm font-medium text-teal-300">
            <Plus className="h-4 w-4" /> {fr ? "Ajouter un médicament" : "Add another medicine"}
          </button>
          {missing.includes(fr ? "Liste des médicaments" : "Medicine list") && <p data-error="true" className="mt-2 text-xs text-restricted">{fr ? "Ajoutez au moins un médicament." : "Add at least one medicine."}</p>}
        </div>

        {/*
          Prescription-only, and now genuinely only.

          Both of these were shown to everybody. On the over-the-counter branch
          an upload box and a "prescription holder" field are not merely
          irrelevant — they read as a requirement, and a customer who thinks
          they need a doctor's note to buy plasters at 1 a.m. closes the tab.
          `hidden` rather than unmounted, so a customer who fills them in and
          then changes the branch by mistake does not silently lose the file.
        */}
        <div className={cn("grid gap-4 sm:grid-cols-2", prescriptionType !== "PRESCRIPTION" && "hidden")}>
          <div className={card}>
            <p className={label}><Upload className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Joindre l'ordonnance" : "Upload prescription"}</p>
            <p className="mb-2 text-xs text-mist-500">JPG, PNG {fr ? "ou" : "or"} PDF (Max 10MB)</p>
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-ink-700 bg-ink-800 px-3 py-2.5 text-xs">
              <span className={uploadedName ? "text-safe" : "text-mist-500"}>{uploading ? "…" : uploadedName ?? (fr ? "Aucun fichier" : "No file selected")}</span>
              <span className="rounded-lg bg-teal-500/15 px-3 py-1 font-semibold text-teal-300">{fr ? "Parcourir" : "Browse"}</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
            </label>
            <p className="mt-1 flex items-center gap-1 text-xs text-mist-500"><ShieldCheck className="h-3 w-3" /> {fr ? "Privé — jamais dans le PDF partagé." : "Private — never in the shared PDF."}</p>
          </div>
          <div className={card}>
            <p className={label}><UserCheck className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Titulaire / récepteur autorisé" : "Prescription holder / authorized receiver"}</p>
            <input className={cn(input, "mt-2")} placeholder={fr ? "ex. Parent, conjoint" : "e.g. Parent, spouse or caregiver"} {...register("serviceDetails.holder" as never)} />
          </div>
        </div>

                {/* Everything optional, folded away. Fields stay mounted inside the
            disclosure, so nothing typed is lost and validation still sees it. */}
        {/* The most we may spend for them. Required, and in the main column:
            it is a money term, not a preference. */}
        <SpendingCapField
          accent={ACCENT}
          fr={fr}
          value={watch("goodsCapXaf")}
          onChange={(v) => setValue("goodsCapXaf", v, { shouldValidate: true })}
          error={missing.includes(fr ? "Plafond de dépense" : "Spending cap")}
          suggestion={fr ? "ex. 10 000" : "e.g. 10,000"}
        />

        <MoreDetails accent={ACCENT} fr={fr}>
        <VoiceNoteField
          accent={ACCENT}
          fr={fr}
          onChange={(n) => {
            setValue("voiceNoteUrl", n?.url ?? "");
            setValue("voiceNoteSeconds", n?.seconds ?? null);
            // Whatever the phone managed to hear. Empty on a browser with no
            // recogniser, which is fine: the server fills it in later if a key
            // is ever configured, and a person can always play the recording.
            setValue("voiceTranscript", n?.transcript ?? "");
          }}
        />

        {/* Toggles */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => setValue("serviceDetails.substituteOk" as never, (!sd?.substituteOk) as never)} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2 text-sm text-mist-200"><Repeat className="h-4 w-4 text-teal-300" /> {fr ? "Marque alternative autorisée" : "Alternate brand allowed"}</span>
            <ToggleDot on={Boolean(sd?.substituteOk)} />
          </button>
          <button type="button" onClick={() => setValue("needsTemperatureCare", !watch("needsTemperatureCare"))} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2 text-sm text-mist-200"><Snowflake className="h-4 w-4 text-teal-300" /> {fr ? "Chaîne du froid / fragile" : "Cold storage / fragile medicine"}</span>
            <ToggleDot on={Boolean(watch("needsTemperatureCare"))} />
          </button>
        </div>
        </MoreDetails>

        {/* Preferred pickup time + delivery address */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <DeliveryTimeField
              accent={ACCENT}
              fr={fr}
              label={fr ? "Heure de ramassage souhaitée" : "Preferred pickup time"}
              value={watch("preferredDeliveryTime")}
              onChange={(v) => setValue("preferredDeliveryTime", v)}
            />
          </div>
          <div className={card}>
            <p className={cn(label, "mb-2")}><MapPin className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Adresse de livraison" : "Delivery address"}</p>
            <SavedAddresses current={deliverySel} onPick={(l) => applySel("delivery", l)} accent={ACCENT} fr={fr} />
            <LocationField label={fr ? "Adresse de livraison" : "Delivery address"} accent={ACCENT} value={deliverySel} error={missing.includes(fr ? "Adresse de livraison" : "Delivery address")} onChange={(l) => applySel("delivery", l)} suggestion={intake?.deliverySuggestion} />
          </div>
        </div>

        {/* Emergency contact */}
        <div className={card}>
          <p className={label}><Phone className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Contact d'urgence / récepteur" : "Emergency / receiver contact"}</p>
          <div className="mt-2 flex">
            <PhonePrefix />
            <input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" {...register("alternativePhone")} />
          </div>
        </div>

        {/* Payment method */}
        <div className={card}>
          <p className={cn(label, "mb-3")}><Banknote className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Mode de paiement" : "Payment method"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { v: "CASH", t: fr ? "Espèces" : "Cash", s: fr ? "À la livraison" : "Pay on delivery" },
              { v: "MTN_MOMO", t: "MTN MoMo", s: fr ? "MTN Mobile Money" : "Pay with MTN Mobile Money" },
              { v: "ORANGE_MONEY", t: "Orange Money", s: fr ? "Orange Money" : "Pay with Orange Money" },
            ].filter((p) => payMethods.includes(p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")).map((p) => (
              <button key={p.v} type="button" onClick={() => setValue("paymentMethod", p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")}
                className={cn("rounded-xl border p-3 text-left", payment === p.v ? "border-teal-400 bg-teal-500/10" : "border-ink-700 bg-ink-800")}>
                <span className={cn("block text-sm font-semibold", payment === p.v ? "text-teal-200" : "text-mist-200")}>{p.t}</span>
                <span className="block text-xs text-mist-500">{p.s}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Important instructions */}
        <div className={card}>
          <p className={label}><ClipboardList className="h-3.5 w-3.5 text-teal-300" /> {fr ? "Instructions importantes / notes" : "Important instructions / caution notes"}</p>
          <textarea maxLength={250} className={cn(input, "mt-2 min-h-20 resize-y")} placeholder={fr ? "ex. Allergique à la pénicilline, contacter avant le ramassage…" : "e.g. Allergic to penicillin, urgent medication, contact before pickup…"} {...register("specialInstructions")} />
          <p className="mt-1 text-right text-xs text-mist-500">{(watch("specialInstructions")?.length ?? 0)}/250</p>
        </div>

        {missing.length > 0 && (
          <div data-error="true" className="rounded-2xl border border-restricted/40 bg-restricted/10 p-3 text-sm text-restricted">
            <p className="mb-1 font-semibold">{fr ? "À compléter :" : "Please complete:"}</p>
            <ul className="list-disc pl-5 text-xs">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <TermsCheckbox
          accent={ACCENT}
          checked={watch("acceptedTerms") === true}
          onChange={(next) => setValue("acceptedTerms", (next ? true : undefined) as unknown as true, { shouldValidate: true })}
          error={missing.includes(fr ? "Accepter les conditions" : "Accept the terms")}
          fr={fr}
        />
      </div>

      {/*
        The same bar as food and parcel.

        This screen had its own footer: a price row, a full-width button, and a
        reassurance line — three stacked elements about 110px tall, phrased
        differently from the other two services. Three hand-rolled footers is
        how a customer comes to believe food and medicine are priced by
        different rules. One bar, and the fee reads the same everywhere.
      */}
      <CartBar
        fr={fr}
        accent="emerald"
        glyph={
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/10">
            <Pill className="h-5 w-5 text-teal-300" />
          </span>
        }
        fare={
          estimatedFee == null
            ? null
            : { totalXaf: estimatedFee, estimated: fare?.estimated ?? true, lines: fare?.lines ?? [] }
        }
        missing={missing.length > 0 ? missing : undefined}
        hint={
          fr
            ? "Choisissez la pharmacie et l'adresse pour voir le prix"
            : "Pick the pharmacy and the address to see the fee"
        }
        cta={fr ? "Vérifier" : "Review"}
        onCta={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

function ToggleDot({ on }: { on: boolean }) {
  return (
    <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-teal-400" : "bg-ink-700")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
    </span>
  );
}
