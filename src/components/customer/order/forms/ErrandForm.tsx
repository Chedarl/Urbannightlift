"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, ClipboardList, Info, Pencil, FileText, MapPin, Flag, Wallet, Upload,
  BellRing, Phone, Banknote, MessageSquare, ChevronRight, ShieldCheck,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { LocationField } from "@/components/customer/location/LocationField";
import { TermsCheckbox } from "@/components/customer/order/fields/TermsCheckbox";
import { DeliveryTimeField } from "@/components/customer/order/fields/DeliveryTimeField";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { cn } from "@/lib/utils";

const ACCENT = "#c084fc";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const input = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-400 focus:outline-none";

export function ErrandForm() {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();

  const [pickupSel, setPickupSel] = useState<SelectedLocation | null>(null);
  const [deliverySel, setDeliverySel] = useState<SelectedLocation | null>(null);
  const [zones, setZones] = useState<{ id: string; zoneName: string; tier: ZoneTier; feeXaf: number }[]>([]);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  const { register, handleSubmit, watch, setValue } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema) as Resolver<OrderInput>,
    defaultValues: {
      preferredLanguage: fr ? "FR" : "EN", serviceType: "CUSTOM_ERRAND", fullName: fr ? "Client" : "Customer", pickupLocation: fr ? "Selon la demande" : "As described in request", deliveryLocation: fr ? "Selon la demande" : "As described in request",
      quantity: 1, declaredValueXaf: 0, itemAlreadyPaid: false, riderPaysAtPickup: false,
      isFragile: false, needsTemperatureCare: false, isMedicine: false, paymentMethod: "CASH",
      acceptedTerms: undefined as unknown as true, serviceDetails: { needsConfirmation: true },
    },
  });

  const sd = watch("serviceDetails") as Record<string, unknown> | undefined;
  const payment = watch("paymentMethod");

  useEffect(() => { fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {}); }, []);

  const effZone = (sel: SelectedLocation | null) => sel?.zoneId ? { id: sel.zoneId, feeXaf: sel.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (sel.tier ?? "GREEN") as ZoneTier } : null;
  const estimatedFee = useMemo(() => estimateDeliveryFee(effZone(pickupSel), effZone(deliverySel)), [pickupSel, deliverySel]);

  function applySel(which: "pickup" | "delivery", loc: SelectedLocation | null) {
    const text = loc ? `${loc.primaryName}${loc.neighbourhood ? ` — ${loc.neighbourhood}` : ""}` : "";
    const landmark = loc ? [loc.landmark, loc.directions].filter(Boolean).join(" — ") : "";
    if (which === "pickup") {
      setPickupSel(loc); setValue("pickupLocation", text, { shouldValidate: true }); setValue("pickupLandmark", landmark);
      setValue("pickupZoneId", loc?.zoneId ?? ""); setValue("pickupLat", loc?.latitude ?? null); setValue("pickupLng", loc?.longitude ?? null);
    } else {
      setDeliverySel(loc); setValue("deliveryLocation", text, { shouldValidate: true }); setValue("deliveryLandmark", landmark);
      setValue("deliveryZoneId", loc?.zoneId ?? ""); setValue("deliveryLat", loc?.latitude ?? null); setValue("deliveryLng", loc?.longitude ?? null);
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
      setValue("screenshotUrl", path); setUploadedName(file.name);
    } catch { setUploadedName(null); } finally { setUploading(false); }
  }

  function onSubmit(data: OrderInput) {
    setMissing([]);
    for (const sel of [pickupSel, deliverySel]) if (sel && SERVICE_STATUS_META[sel.serviceStatus] && !SERVICE_STATUS_META[sel.serviceStatus].ok) { setMissing([fr ? "Un lieu sélectionné n'est pas desservi." : "A selected location isn't serviceable."]); return; }
    const phone = (data.whatsappNumber ?? "").trim();
    const asDescribed = fr ? "Selon la demande" : "As described in request";
    saveDraft({
      ...data,
      fullName: data.fullName?.trim() || (fr ? `Client ${phone}` : `Customer ${phone}`),
      // Errand pickup/destination are optional — fall back so the order stays valid.
      pickupLocation: data.pickupLocation?.trim() || asDescribed,
      deliveryLocation: data.deliveryLocation?.trim() || asDescribed,
      pickupLat: pickupSel?.latitude ?? null, pickupLng: pickupSel?.longitude ?? null,
      deliveryLat: deliverySel?.latitude ?? null, deliveryLng: deliverySel?.longitude ?? null,
      estimatedFeeXaf: estimatedFee, pickupZoneName: pickupSel?.zoneName ?? undefined, deliveryZoneName: deliverySel?.zoneName ?? undefined,
    });
    router.push("/order/review");
  }
  function onInvalid(errs: Record<string, unknown>) {
    const labels: Record<string, string> = {
      acceptedTerms: fr ? "Accepter les conditions" : "Accept the terms",
      whatsappNumber: fr ? "Numéro de contact" : "Contact phone number",
      itemDescription: fr ? "Description de la course" : "Errand description",
    };
    setMissing(Object.keys(errs).map((k) => labels[k]).filter(Boolean) as string[]);
    document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const PhonePrefix = () => <span className="flex shrink-0 items-center gap-1 rounded-l-xl border border-r-0 border-ink-700 bg-ink-800 px-2.5 text-sm text-mist-300">🇨🇲 +237</span>;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="mx-auto max-w-xl pb-28">
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={() => router.back()} className="rounded-xl border border-ink-700 bg-ink-900/60 p-2 text-mist-300"><ArrowLeft className="h-5 w-5" /></button>
        <Logo height={30} /><LanguageSwitch />
      </div>
      <div className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-b from-violet-500/25 via-fuchsia-600/10 to-transparent px-5 pb-7 pt-4">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300"><ClipboardList className="h-8 w-8" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">{fr ? "Course personnalisée" : "Custom errand request"}</h1>
            <p className="mt-1 text-sm font-medium text-violet-300">{fr ? "Étape 1 sur 3" : "Step 1 of 3"} <span className="text-mist-400">· {fr ? "Détails de la demande" : "Request details"}</span></p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-violet-500/30 bg-violet-950/30 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
          <p className="text-xs leading-relaxed text-violet-100"><span className="font-semibold">{fr ? "Une demande unique ? Nous sommes là." : "Got something unique in mind? We're here to help."}</span> {fr ? "Notre dispatcher confirmera si votre demande peut être traitée." : "Our dispatcher will confirm if your request can be handled."}</p>
        </div>

        {/* Title */}
        <div className={card}>
          <p className={label}><Pencil className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Titre de la demande" : "Request title"}</p>
          <input className={cn(input, "mt-2")} placeholder={fr ? "ex. Acheter un billet, récupérer des documents…" : "e.g. Buy event ticket, Pick up documents, Find a technician…"} {...register("serviceDetails.title" as never)} />
        </div>

        {/* Describe */}
        <div className={card}>
          <p className={label}><FileText className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Décrivez la course en détail" : "Describe the errand in detail"}</p>
          <p className="mb-2 text-[11px] text-mist-500">{fr ? "Soyez précis pour que nous puissions mieux vous aider." : "Be as specific as possible so we can assist you better."}</p>
          <textarea maxLength={1000} className={cn(input, "min-h-28 resize-y")} placeholder={fr ? "Dites-nous exactement ce qu'il faut faire…" : "Tell us exactly what you need done…"} data-error={missing.includes(fr ? "Description de la course" : "Errand description") ? "true" : undefined} {...register("itemDescription")} />
          <p className="mt-1 text-right text-[11px] text-mist-500">{(watch("itemDescription")?.length ?? 0)}/1000</p>
        </div>

        {/* Pickup + destination (optional) */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={cn(label, "mb-2")}><MapPin className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Lieu de départ" : "Pickup location"} <span className="text-mist-500">({fr ? "si applicable" : "if applicable"})</span></p>
            <LocationField mode="pickup" label={fr ? "Lieu de départ" : "Pickup location"} accent={ACCENT} value={pickupSel} onChange={(l) => applySel("pickup", l)} />
          </div>
          <div className={card}>
            <p className={cn(label, "mb-2")}><Flag className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Destination" : "Destination / drop-off"} <span className="text-mist-500">({fr ? "si applicable" : "if applicable"})</span></p>
            <LocationField label={fr ? "Destination" : "Destination"} accent={ACCENT} value={deliverySel} onChange={(l) => applySel("delivery", l)} />
          </div>
        </div>

        {/* Time + budget */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <DeliveryTimeField
              accent={ACCENT}
              fr={fr}
              label={fr ? "Créneau horaire souhaité" : "Preferred time window"}
              value={watch("preferredDeliveryTime")}
              onChange={(v) => setValue("preferredDeliveryTime", v)}
            />
          </div>
          <div className={card}>
            <p className={label}><Wallet className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Budget / montant estimé (XAF)" : "Budget or expected amount (XAF)"}</p>
            <p className="mb-1 text-[11px] text-mist-500">{fr ? "Pour achats, paiements ou frais" : "For purchases, payments, or fees"}</p>
            <input className={input} type="number" min={0} step={500} inputMode="numeric" placeholder={fr ? "ex. 10 000" : "e.g. 10,000"} {...register("serviceDetails.budgetXaf" as never)} />
          </div>
        </div>

        {/* Attachment */}
        <div className={card}>
          <p className={label}><Upload className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Pièce jointe" : "Attachment"} <span className="text-mist-500">({fr ? "photos, docs" : "photos, screenshots, docs"})</span></p>
          <label className="mt-2 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-violet-500/40 px-3 py-4 text-center text-xs">
            <span className={uploadedName ? "text-safe" : "text-violet-300"}>{uploading ? "…" : uploadedName ?? (fr ? "Ajouter un fichier · JPG, PNG, PDF ≤10MB" : "Upload files · JPG, PNG, PDF up to 10MB")}</span>
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
          </label>
        </div>

        {/* Confirmation toggle + who receives update */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => setValue("serviceDetails.needsConfirmation" as never, (!sd?.needsConfirmation) as never)} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-violet-300" /><span><span className="block text-sm text-mist-100">{fr ? "Confirmation dispatcher ?" : "Need dispatcher confirmation?"}</span><span className="block text-[11px] text-mist-500">{fr ? "Nous confirmerons la faisabilité." : "We'll confirm if your request can be handled."}</span></span></span>
            <ToggleDot on={Boolean(sd?.needsConfirmation)} />
          </button>
          <div className={card}>
            <p className={label}><Phone className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Qui recevra les mises à jour ?" : "Who will receive the update?"}</p>
            <div className="mt-2 flex"><PhonePrefix /><input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" data-error={missing.includes(fr ? "Numéro de contact" : "Contact phone number") ? "true" : undefined} {...register("whatsappNumber")} /></div>
          </div>
        </div>

        {/* Access instructions */}
        <div className={card}>
          <p className={label}><MapPin className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Instructions d'accès / repères" : "Special access instructions / landmarks"}</p>
          <input className={cn(input, "mt-2")} placeholder={fr ? "ex. Code du portail, bâtiment, repère…" : "e.g. Gate code, building name, nearby landmark…"} {...register("serviceDetails.accessNotes" as never)} />
        </div>

        {/* Payment */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><Banknote className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Mode de paiement préféré" : "Preferred payment method"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ v: "CASH", t: fr ? "Espèces" : "Cash", s: fr ? "À la livraison" : "Pay on delivery" }, { v: "MTN_MOMO", t: "MTN MoMo", s: "Mobile Money" }, { v: "ORANGE_MONEY", t: "Orange Money", s: "Orange Money" }].map((p) => (
              <button key={p.v} type="button" onClick={() => setValue("paymentMethod", p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")} className={cn("rounded-xl border p-3 text-left", payment === p.v ? "border-violet-400 bg-violet-500/10" : "border-ink-700 bg-ink-800")}>
                <span className={cn("block text-sm font-semibold", payment === p.v ? "text-violet-200" : "text-mist-200")}>{p.t}</span><span className="block text-[11px] text-mist-500">{p.s}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Additional notes */}
        <div className={card}>
          <p className={label}><MessageSquare className="h-3.5 w-3.5 text-violet-300" /> {fr ? "Notes supplémentaires" : "Additional notes"} <span className="text-mist-500">({fr ? "optionnel" : "optional"})</span></p>
          <textarea maxLength={500} className={cn(input, "mt-2 min-h-16 resize-y")} placeholder={fr ? "Autre chose à savoir ?" : "Anything else we should know?"} {...register("specialInstructions")} />
          <p className="mt-1 text-right text-[11px] text-mist-500">{(watch("specialInstructions")?.length ?? 0)}/500</p>
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-violet-500/30 bg-ink-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {estimatedFee != null && (
          <div className="mx-auto mb-2 flex max-w-xl items-center justify-between rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2">
            <span className="text-xs text-mist-400">{fr ? "Frais de livraison estimés" : "Estimated delivery fee"}</span>
            <span className="font-display text-base font-bold text-mist-100">{estimatedFee.toLocaleString("fr-FR")} XAF</span>
          </div>
        )}
        <button type="submit" className="mx-auto flex w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-violet-500 py-3.5 font-display text-base font-bold text-white">
          <ClipboardList className="h-5 w-5" /><span>{fr ? "Vérifier la demande" : "Review request summary"}</span><ChevronRight className="h-5 w-5" />
        </button>
        <p className="mt-1.5 text-center text-[11px] text-mist-500"><ShieldCheck className="mr-1 inline h-3 w-3 text-violet-400" />{fr ? "Vos informations sont en sécurité, traitées avec discrétion." : "Your details are safe with us. We handle every request with care."}</p>
      </div>
    </form>
  );
}

function ToggleDot({ on }: { on: boolean }) {
  return <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-violet-500" : "bg-ink-700")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} /></span>;
}
