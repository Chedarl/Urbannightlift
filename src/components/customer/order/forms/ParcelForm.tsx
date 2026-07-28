"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Package, User, Phone, MapPin, FileText, Smartphone, Shirt, MoreHorizontal, Scale, DollarSign,
  Wine, Lock, Camera, Clock, ClipboardList, Banknote, ChevronRight, ShieldCheck, Signature, ShieldCheck as ShieldIcon,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { LocationField } from "@/components/customer/location/LocationField";
import { TermsCheckbox } from "@/components/customer/order/fields/TermsCheckbox";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { cn } from "@/lib/utils";

const ACCENT = "#3b82f6";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const section = "text-xs font-semibold uppercase tracking-wide text-blue-300";
const input = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-blue-400 focus:outline-none";

export function ParcelForm() {
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
      preferredLanguage: fr ? "FR" : "EN", serviceType: "SMALL_PARCEL", fullName: fr ? "Expéditeur" : "Sender",
      quantity: 1, declaredValueXaf: 0, itemAlreadyPaid: false, riderPaysAtPickup: false,
      isFragile: false, needsTemperatureCare: false, isMedicine: false, paymentMethod: "CASH",
      acceptedTerms: undefined as unknown as true,
      serviceDetails: { category: "DOCUMENTS", size: "S", sealed: false, proofPref: "PHOTO" },
    },
  });

  const sd = watch("serviceDetails") as Record<string, unknown> | undefined;
  const category = (sd?.category as string) ?? "DOCUMENTS";
  const size = (sd?.size as string) ?? "S";
  const proofPref = (sd?.proofPref as string) ?? "PHOTO";
  const payment = watch("paymentMethod");

  useEffect(() => { fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {}); }, []);
  useEffect(() => {
    const catLabel = CATS.find((c) => c.v === category);
    setValue("itemDescription", `${catLabel ? (fr ? catLabel.fr : catLabel.en) : "Parcel"} · ${size}`, { shouldValidate: true });
  }, [category, size, fr, setValue]);

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
    if (!file || file.size > 5 * 1024 * 1024) return;
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
    saveDraft({
      ...data,
      fullName: (sd?.senderName as string)?.trim() || data.fullName?.trim() || (fr ? "Expéditeur" : "Sender"),
      pickupLat: pickupSel?.latitude ?? null, pickupLng: pickupSel?.longitude ?? null,
      deliveryLat: deliverySel?.latitude ?? null, deliveryLng: deliverySel?.longitude ?? null,
      estimatedFeeXaf: estimatedFee, pickupZoneName: pickupSel?.zoneName ?? undefined, deliveryZoneName: deliverySel?.zoneName ?? undefined,
    });
    router.push("/order/review");
  }
  function onInvalid(errs: Record<string, unknown>) {
    const labels: Record<string, string> = {
      acceptedTerms: fr ? "Accepter les conditions" : "Accept the terms",
      whatsappNumber: fr ? "Téléphone de l'expéditeur" : "Sender phone number",
      pickupLocation: fr ? "Adresse de ramassage" : "Pickup address",
      deliveryLocation: fr ? "Adresse de dépôt" : "Drop-off address",
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
      <div className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-b from-blue-500/25 via-indigo-600/10 to-transparent px-5 pb-7 pt-4">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300"><Package className="h-8 w-8" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">{fr ? "Livraison de colis" : "Small parcel delivery"}</h1>
            <p className="mt-1 text-sm font-medium text-blue-300">{fr ? "Étape 1 sur 3" : "Step 1 of 3"} <span className="text-mist-400">· {fr ? "Détails de l'envoi" : "Shipment details"}</span></p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        {/* Sender */}
        <div className={card}>
          <p className={cn(section, "mb-3 flex items-center gap-1.5")}><User className="h-4 w-4" /> {fr ? "Expéditeur" : "Sender details"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>{fr ? "Nom complet" : "Sender full name"}</p>
              <input className={cn(input, "mt-1")} placeholder={fr ? "ex. Jean Michel" : "e.g. Jean Michel"} {...register("serviceDetails.senderName" as never)} />
            </div>
            <div>
              <p className={label}>{fr ? "Téléphone" : "Sender phone number"}</p>
              <div className="mt-1 flex"><PhonePrefix /><input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" data-error={missing.includes(fr ? "Téléphone de l'expéditeur" : "Sender phone number") ? "true" : undefined} {...register("whatsappNumber")} /></div>
            </div>
          </div>
          <p className={cn(label, "mb-1 mt-3")}><MapPin className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Adresse de ramassage" : "Pickup address"}</p>
          <LocationField mode="pickup" label={fr ? "Adresse de ramassage" : "Pickup address"} accent={ACCENT} value={pickupSel} error={missing.includes(fr ? "Adresse de ramassage" : "Pickup address")} onChange={(l) => applySel("pickup", l)} />
        </div>

        {/* Receiver */}
        <div className={card}>
          <p className={cn(section, "mb-3 flex items-center gap-1.5")}><User className="h-4 w-4" /> {fr ? "Destinataire" : "Receiver details"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>{fr ? "Nom complet" : "Receiver full name"}</p>
              <input className={cn(input, "mt-1")} placeholder={fr ? "ex. Marie Claire" : "e.g. Marie Claire"} {...register("serviceDetails.receiverName" as never)} />
            </div>
            <div>
              <p className={label}>{fr ? "Téléphone" : "Receiver phone number"}</p>
              <div className="mt-1 flex"><PhonePrefix /><input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" {...register("serviceDetails.receiverPhone" as never)} /></div>
            </div>
          </div>
          <p className={cn(label, "mb-1 mt-3")}><MapPin className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Adresse de dépôt" : "Drop-off address"}</p>
          <LocationField label={fr ? "Adresse de dépôt" : "Drop-off address"} accent={ACCENT} value={deliverySel} error={missing.includes(fr ? "Adresse de dépôt" : "Drop-off address")} onChange={(l) => applySel("delivery", l)} />
        </div>

        {/* Category + size */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={cn(label, "mb-2")}><Package className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Catégorie du colis" : "Parcel category"}</p>
            <div className="grid grid-cols-2 gap-2">
              {CATS.map((c) => (
                <button key={c.v} type="button" onClick={() => setValue("serviceDetails.category" as never, c.v as never)} className={cn("flex items-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium", category === c.v ? "border-blue-400 bg-blue-500/10 text-blue-200" : "border-ink-700 bg-ink-800 text-mist-300")}>
                  <c.icon className="h-4 w-4" /> {fr ? c.fr : c.en}
                </button>
              ))}
            </div>
          </div>
          <div className={card}>
            <p className={cn(label, "mb-2")}><Package className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Taille du paquet" : "Package size"}</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: "S", t: fr ? "Petit" : "Small" }, { v: "M", t: fr ? "Moyen" : "Medium" }, { v: "L", t: fr ? "Grand" : "Large" }].map((o) => (
                <button key={o.v} type="button" onClick={() => setValue("serviceDetails.size" as never, o.v as never)} className={cn("rounded-xl border px-2 py-2.5 text-sm font-semibold", size === o.v ? "border-blue-400 bg-blue-500/10 text-blue-200" : "border-ink-700 bg-ink-800 text-mist-300")}>{o.t}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Weight + declared value */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={label}><Scale className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Poids" : "Weight"}</p>
            <div className="mt-2 flex">
              <input className={cn(input, "rounded-r-none")} type="number" min={0} step={0.1} inputMode="decimal" placeholder="0.5" {...register("serviceDetails.weight" as never)} />
              <span className="flex items-center rounded-r-xl border border-l-0 border-ink-700 bg-ink-800 px-3 text-sm text-mist-400">kg</span>
            </div>
          </div>
          <div className={card}>
            <p className={label}><DollarSign className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Valeur déclarée (XAF)" : "Declared value (XAF)"}</p>
            <input className={cn(input, "mt-2")} type="number" min={0} step={500} inputMode="numeric" placeholder={fr ? "ex. 10 000" : "e.g. 10,000"} {...register("declaredValueXaf")} />
          </div>
        </div>

        {/* Toggles */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => setValue("isFragile", !watch("isFragile"))} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2"><Wine className="h-4 w-4 text-blue-300" /><span><span className="block text-sm text-mist-100">{fr ? "Fragile" : "Fragile"}</span><span className="block text-[11px] text-mist-500">{fr ? "Manipuler avec soin" : "Handle with extra care"}</span></span></span>
            <ToggleDot on={Boolean(watch("isFragile"))} />
          </button>
          <button type="button" onClick={() => setValue("serviceDetails.sealed" as never, (!sd?.sealed) as never)} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-blue-300" /><span><span className="block text-sm text-mist-100">{fr ? "Colis scellé" : "Sealed package"}</span><span className="block text-[11px] text-mist-500">{fr ? "Le colis est scellé" : "Package is sealed"}</span></span></span>
            <ToggleDot on={Boolean(sd?.sealed)} />
          </button>
        </div>

        {/* Photo + pickup time */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={label}><Camera className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Photo du colis" : "Parcel photo"}</p>
            <label className="mt-2 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-ink-700 bg-ink-800 px-3 py-4 text-center text-xs">
              <span className={uploadedName ? "text-safe" : "text-mist-400"}>{uploading ? "…" : uploadedName ?? (fr ? "Ajouter une photo (JPG, PNG ≤5MB)" : "Upload a photo of the parcel · JPG, PNG up to 5MB")}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </label>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-mist-500"><ShieldCheck className="h-3 w-3" /> {fr ? "Privé — jamais dans le PDF partagé." : "Private — never in the shared PDF."}</p>
          </div>
          <div className={card}>
            <p className={label}><Clock className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Heure de ramassage" : "Pickup time"}</p>
            <input className={cn(input, "mt-2")} placeholder={fr ? "ex. Ce soir, 22h30" : "e.g. Tonight, 10:30 PM"} {...register("preferredDeliveryTime")} />
          </div>
        </div>

        {/* Delivery note */}
        <div className={card}>
          <p className={label}><ClipboardList className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Note de livraison / repère" : "Delivery note / landmark"}</p>
          <textarea maxLength={200} className={cn(input, "mt-2 min-h-16 resize-y")} placeholder={fr ? "ex. Code du portail, nom du bâtiment, repère…" : "e.g. Gate code, building name, nearest landmark…"} {...register("specialInstructions")} />
          <p className="mt-1 text-right text-[11px] text-mist-500">{(watch("specialInstructions")?.length ?? 0)}/200</p>
        </div>

        {/* Proof of delivery */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><ShieldIcon className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Preuve de livraison" : "Proof of delivery preference"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ v: "PHOTO", icon: Camera, t: fr ? "Photo" : "Photo proof" }, { v: "SIGNATURE", icon: Signature, t: fr ? "Signature" : "Signature" }, { v: "OTP", icon: ShieldIcon, t: fr ? "Code OTP" : "OTP confirmation" }].map((o) => (
              <button key={o.v} type="button" onClick={() => setValue("serviceDetails.proofPref" as never, o.v as never)} className={cn("flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium", proofPref === o.v ? "border-blue-400 bg-blue-500/10 text-blue-200" : "border-ink-700 bg-ink-800 text-mist-300")}>
                <o.icon className="h-4 w-4" /> {o.t}
              </button>
            ))}
          </div>
        </div>

        {/* Payment */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><Banknote className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Mode de paiement" : "Payment method"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ v: "CASH", t: fr ? "Espèces" : "Cash", s: fr ? "À la livraison" : "Pay on delivery" }, { v: "MTN_MOMO", t: "MTN MoMo", s: "Mobile Money" }, { v: "ORANGE_MONEY", t: "Orange Money", s: "Orange Money" }].map((p) => (
              <button key={p.v} type="button" onClick={() => setValue("paymentMethod", p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")} className={cn("rounded-xl border p-3 text-left", payment === p.v ? "border-blue-400 bg-blue-500/10" : "border-ink-700 bg-ink-800")}>
                <span className={cn("block text-sm font-semibold", payment === p.v ? "text-blue-200" : "text-mist-200")}>{p.t}</span><span className="block text-[11px] text-mist-500">{p.s}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-blue-500/25 bg-blue-950/20 p-3 text-xs text-blue-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p><span className="font-semibold">{fr ? "Articles sûrs, légaux et déclarés uniquement." : "Safe, legal, declared items only."}</span> {fr ? "Les armes, drogues, explosifs et biens illégaux sont interdits." : "Prohibited items include weapons, drugs, explosives, and illegal goods."}</p>
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-blue-500/30 bg-ink-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {estimatedFee != null && (
          <div className="mx-auto mb-2 flex max-w-xl items-center justify-between rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2">
            <span className="text-xs text-mist-400">{fr ? "Frais de livraison estimés" : "Estimated delivery fee"}</span>
            <span className="font-display text-base font-bold text-mist-100">{estimatedFee.toLocaleString("fr-FR")} XAF</span>
          </div>
        )}
        <button type="submit" className="mx-auto flex w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-blue-500 py-3.5 font-display text-base font-bold text-white">
          <Package className="h-5 w-5" /><span>{fr ? "Vérifier la commande" : "Review order summary"}</span><ChevronRight className="h-5 w-5" />
        </button>
        <p className="mt-1.5 text-center text-[11px] text-mist-500"><ShieldCheck className="mr-1 inline h-3 w-3 text-blue-400" />{fr ? "Votre commande est protégée. Traitée avec soin." : "Your order is protected. We handle it with care."}</p>
      </div>
    </form>
  );
}

const CATS = [
  { v: "DOCUMENTS", icon: FileText, en: "Documents", fr: "Documents" },
  { v: "ELECTRONICS", icon: Smartphone, en: "Electronics", fr: "Électronique" },
  { v: "CLOTHING", icon: Shirt, en: "Clothing", fr: "Vêtements" },
  { v: "OTHER", icon: MoreHorizontal, en: "Other", fr: "Autre" },
];

function ToggleDot({ on }: { on: boolean }) {
  return <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-blue-500" : "bg-ink-700")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} /></span>;
}
