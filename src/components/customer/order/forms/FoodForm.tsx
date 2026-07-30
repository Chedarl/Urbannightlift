"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, UtensilsCrossed, Store, ShoppingCart, ShoppingBasket, Trash2, Plus, Minus,
  Flame, Wallet, MapPin, Phone, Banknote, ClipboardList, ChevronRight, ShieldCheck, Info,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { estimateDeliveryFee, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { LocationField } from "@/components/customer/location/LocationField";
import { MerchantField } from "@/components/customer/merchant/MerchantField";
import { TermsCheckbox } from "@/components/customer/order/fields/TermsCheckbox";
import { DeliveryTimeField } from "@/components/customer/order/fields/DeliveryTimeField";
import { SavedAddresses } from "@/components/customer/order/fields/SavedAddresses";
import { VoiceNoteField } from "@/components/customer/order/fields/VoiceNoteField";
import { WelcomeBack } from "@/components/customer/order/fields/WelcomeBack";
import { isRealName, localPhone, useProfilePrefill, useDeliverToAddress } from "@/lib/account/profile";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { cn } from "@/lib/utils";
import type { MerchantResult } from "@/app/api/merchants/search/route";

const ACCENT = "#f59e0b";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const input = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-amber-400 focus:outline-none";

interface Item { name: string; qty: number; notes: string }
const PREFS = [
  { v: "no_onions", en: "No onions", fr: "Sans oignons" },
  { v: "no_pepper", en: "No pepper", fr: "Sans piment" },
  { v: "less_spicy", en: "Less spicy", fr: "Peu épicé" },
  { v: "medium", en: "Medium", fr: "Moyen" },
  { v: "extra_spicy", en: "Extra spicy", fr: "Très épicé" },
];

export function FoodForm() {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();

  const [pickupSel, setPickupSel] = useState<SelectedLocation | null>(null);
  const [deliverySel, setDeliverySel] = useState<SelectedLocation | null>(null);
  // "Deliver here" from a portal saved-place tap (?deliverTo=…) — a real
  // shortcut, distinct from the plain Order tab.
  useDeliverToAddress((l) => applySel("delivery", l));
  const [zones, setZones] = useState<{ id: string; zoneName: string; tier: ZoneTier; feeXaf: number; medicineFeeXaf: number }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [merchant, setMerchant] = useState<MerchantResult | null>(null);
  const [vendorName, setVendorName] = useState("");

  const { register, handleSubmit, watch, setValue, getValues, control } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema) as Resolver<OrderInput>,
    defaultValues: {
      preferredLanguage: fr ? "FR" : "EN",
      serviceType: "FOOD_PICKUP",
      fullName: fr ? "Client" : "Customer",
      quantity: 1,
      declaredValueXaf: 0,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: false,
      paymentMethod: "CASH",
      acceptedTerms: undefined as unknown as true,
      serviceDetails: { source: "RESTAURANT", cutlery: true, preferences: [], items: [{ name: "", qty: 1, notes: "" }] },
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "serviceDetails.items" as never });
  const sd = watch("serviceDetails") as Record<string, unknown> | undefined;
  const items = (sd?.items as Item[] | undefined) ?? [];
  const prefs = (sd?.preferences as string[] | undefined) ?? [];
  const source = (sd?.source as string) ?? "RESTAURANT";
  const payment = watch("paymentMethod");

  useProfilePrefill((p) => {
    if (isRealName(p.fullName)) setValue("fullName", p.fullName);
    if (!getValues("whatsappNumber")) setValue("whatsappNumber", localPhone(p.whatsappNumber), { shouldValidate: true });
  });

  useEffect(() => {
    fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    const text = items.filter((m) => m?.name).map((m) => `${m.qty || 1}× ${m.name}${m.notes ? ` (${m.notes})` : ""}`).join(", ");
    if (text) setValue("itemDescription", text, { shouldValidate: true });
  }, [items, setValue]);

  const effZone = (sel: SelectedLocation | null) =>
    sel?.zoneId ? { id: sel.zoneId, feeXaf: sel.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (sel.tier ?? "GREEN") as ZoneTier } : null;
  const estimatedFee = useMemo(() => estimateDeliveryFee(effZone(pickupSel), effZone(deliverySel)), [pickupSel, deliverySel]);

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

  /**
   * A verified merchant brings its own pin, phone and zone, so choosing one
   * fills the pickup location too — which is the whole point: the rider leaves
   * with a place, not a name to ask strangers about.
   */
  function pickMerchant(m: MerchantResult, loc: SelectedLocation) {
    setMerchant(m);
    setVendorName(m.merchantName);
    setValue("merchantId", m.id);
    setValue("serviceDetails.vendorName" as never, m.merchantName as never);
    applySel("pickup", loc);
  }

  /** Not in our catalogue — keep the typed name and ask for the location. */
  function useTypedVendor(name: string) {
    setMerchant(null);
    setVendorName(name);
    setValue("merchantId", "");
    setValue("serviceDetails.vendorName" as never, name as never);
  }

  function setQty(i: number, delta: number) {
    const cur = Number(items[i]?.qty || 1);
    setValue(`serviceDetails.items.${i}.qty` as never, Math.max(1, cur + delta) as never, { shouldValidate: true });
  }

  function togglePref(v: string) {
    const next = prefs.includes(v) ? prefs.filter((p) => p !== v) : [...prefs, v];
    setValue("serviceDetails.preferences" as never, next as never);
  }

  function onSubmit(data: OrderInput) {
    setMissing([]);
    for (const sel of [pickupSel, deliverySel]) {
      if (sel && SERVICE_STATUS_META[sel.serviceStatus] && !SERVICE_STATUS_META[sel.serviceStatus].ok) {
        setMissing([fr ? "Un lieu sélectionné n'est pas desservi." : "A selected location isn't serviceable."]);
        return;
      }
    }
    // The mock has no name field — key the guest order on the recipient phone.
    const phone = (data.whatsappNumber ?? "").trim();
    saveDraft({
      ...data,
      fullName: data.fullName?.trim() || (fr ? `Client ${phone}` : `Customer ${phone}`),
      pickupLat: pickupSel?.latitude ?? null,
      pickupLng: pickupSel?.longitude ?? null,
      deliveryLat: deliverySel?.latitude ?? null,
      deliveryLng: deliverySel?.longitude ?? null,
      estimatedFeeXaf: estimatedFee,
      pickupZoneName: pickupSel?.zoneName ?? undefined,
      deliveryZoneName: deliverySel?.zoneName ?? undefined,
    });
    router.push("/order/review");
  }

  function onInvalid(errs: Record<string, unknown>) {
    const labels: Record<string, string> = {
      acceptedTerms: fr ? "Accepter les conditions" : "Accept the terms",
      whatsappNumber: fr ? "Numéro du destinataire" : "Recipient phone number",
      pickupLocation: fr ? "Lieu du restaurant" : "Restaurant location",
      deliveryLocation: fr ? "Adresse de livraison" : "Delivery address",
      itemDescription: fr ? "Articles de la commande" : "Items in your order",
    };
    setMissing(Object.keys(errs).map((k) => labels[k]).filter(Boolean) as string[]);
    document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const PhonePrefix = () => (
    <span className="flex shrink-0 items-center gap-1 rounded-l-xl border border-r-0 border-ink-700 bg-ink-800 px-2.5 text-sm text-mist-300">🇨🇲 +237</span>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="mx-auto max-w-xl pb-28">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" onClick={() => router.back()} className="rounded-xl border border-ink-700 bg-ink-900/60 p-2 text-mist-300"><ArrowLeft className="h-5 w-5" /></button>
        <Logo height={30} />
        <LanguageSwitch />
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-b from-amber-500/25 via-orange-600/10 to-transparent px-5 pb-7 pt-4">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300"><UtensilsCrossed className="h-8 w-8" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">{fr ? "Commande repas" : "Food pickup order"}</h1>
            <p className="mt-1 text-sm font-medium text-amber-300">{fr ? "Étape 1 sur 3" : "Step 1 of 3"} <span className="text-mist-400">· {fr ? "Détails de la commande" : "Order details"}</span></p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        <WelcomeBack accent={ACCENT} fr={fr} />

        <VoiceNoteField
          accent={ACCENT}
          fr={fr}
          onChange={(n) => {
            setValue("voiceNoteUrl", n?.url ?? "");
            setValue("voiceNoteSeconds", n?.seconds ?? null);
          }}
        />

        {/* Restaurant name + location */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <MerchantField
              category="FOOD"
              accent={ACCENT}
              fr={fr}
              label={fr ? "Nom du restaurant / vendeur" : "Restaurant / vendor name"}
              placeholder={fr ? "ex. Le Basilic, Chez Maman" : "e.g. Le Basilic, Mama's Kitchen"}
              value={vendorName}
              merchantId={merchant?.id ?? null}
              onPick={pickMerchant}
              onFreeText={useTypedVendor}
            />
          </div>
          {/* A chosen merchant already carries its own pin, so asking for the
              location again would only invite a contradiction. */}
          {!merchant && (
            <div className={card}>
              <p className={cn(label, "mb-2")}><MapPin className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Lieu du restaurant" : "Restaurant location"}</p>
              <LocationField mode="pickup" label={fr ? "Lieu du restaurant" : "Restaurant location"} accent={ACCENT} value={pickupSel} error={missing.includes(fr ? "Lieu du restaurant" : "Restaurant location")} onChange={(l) => applySel("pickup", l)} />
            </div>
          )}
        </div>

        {/* Order source */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><Info className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Source de la commande" : "Order source"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { v: "RESTAURANT", icon: Store, t: fr ? "Restaurant" : "Restaurant", s: fr ? "Un restaurant établi" : "From an established restaurant" },
              { v: "STREET_VENDOR", icon: ShoppingCart, t: fr ? "Vendeur de rue" : "Street vendor", s: fr ? "Un vendeur local" : "From a local vendor" },
            ].map((o) => (
              <button key={o.v} type="button" onClick={() => setValue("serviceDetails.source" as never, o.v as never)}
                className={cn("flex items-center gap-3 rounded-xl border p-3 text-left", source === o.v ? "border-amber-400 bg-amber-500/10" : "border-ink-700 bg-ink-800")}>
                <o.icon className={cn("h-5 w-5", source === o.v ? "text-amber-300" : "text-mist-400")} />
                <span className="flex-1">
                  <span className={cn("block text-sm font-semibold", source === o.v ? "text-amber-200" : "text-mist-200")}>{o.t}</span>
                  <span className="block text-[11px] text-mist-500">{o.s}</span>
                </span>
                <span className={cn("h-4 w-4 rounded-full border", source === o.v ? "border-amber-400 bg-amber-400" : "border-ink-600")} />
              </button>
            ))}
          </div>
        </div>

        {/* Items */}
        <div className={card}>
          <div className="mb-3 flex items-center gap-2">
            <ShoppingBasket className="h-4 w-4 text-amber-300" />
            <p className="text-sm font-semibold text-mist-100">{fr ? "Articles de votre commande" : "Items in your order"}</p>
          </div>
          <div className="hidden grid-cols-[1fr_auto_1fr_auto] gap-2 px-1 pb-1 text-[11px] text-mist-500 sm:grid">
            <span>{fr ? "Article" : "Item"}</span><span className="text-center">{fr ? "Quantité" : "Quantity"}</span><span>{fr ? "Notes (optionnel)" : "Notes (optional)"}</span><span />
          </div>
          <div className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <input className={input} placeholder={fr ? "Riz sauté au poulet" : "Jollof Rice with Chicken"} {...register(`serviceDetails.items.${i}.name` as never)} />
                <div className="flex items-center rounded-xl border border-ink-700 bg-ink-800">
                  <button type="button" onClick={() => setQty(i, -1)} className="px-2 py-2 text-mist-400"><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center text-sm text-mist-100">{items[i]?.qty || 1}</span>
                  <button type="button" onClick={() => setQty(i, 1)} className="px-2 py-2 text-amber-300"><Plus className="h-4 w-4" /></button>
                </div>
                <input className={input} placeholder={fr ? "Extra poulet, sans piment" : "Extra chicken, no pepper"} {...register(`serviceDetails.items.${i}.notes` as never)} />
                <button type="button" onClick={() => remove(i)} className="p-1.5 text-mist-500 hover:text-restricted" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => append({ name: "", qty: 1, notes: "" } as never)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-500/40 py-2.5 text-sm font-medium text-amber-300">
            <Plus className="h-4 w-4" /> {fr ? "Ajouter un article" : "Add another item"}
          </button>
          {missing.includes(fr ? "Articles de la commande" : "Items in your order") && <p data-error="true" className="mt-2 text-xs text-restricted">{fr ? "Ajoutez au moins un article." : "Add at least one item."}</p>}
        </div>

        {/* Food preferences */}
        <div className={card}>
          <p className={label}><Flame className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Préférences" : "Food preferences"} <span className="text-mist-500">{fr ? "Dites-nous comment vous l'aimez" : "Tell us how you like it"}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PREFS.map((p) => (
              <button key={p.v} type="button" onClick={() => togglePref(p.v)}
                className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium", prefs.includes(p.v) ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-ink-700 bg-ink-800 text-mist-400")}>
                <Flame className="h-3.5 w-3.5" /> {fr ? p.fr : p.en}
              </button>
            ))}
          </div>
        </div>

        {/* Cutlery + preferred time */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <button type="button" onClick={() => setValue("serviceDetails.cutlery" as never, (!sd?.cutlery) as never)} className={cn(card, "flex items-center justify-between text-left")}>
              <span className="flex items-center gap-2">
                <UtensilsCrossed className="h-4 w-4 text-amber-300" />
                <span>
                  <span className="block text-sm text-mist-100">{fr ? "Couverts nécessaires ?" : "Cutlery needed?"}</span>
                  <span className="block text-[11px] text-mist-500">{fr ? "Couverts, serviettes, etc." : "Include cutlery, napkins, etc."}</span>
                </span>
              </span>
              <ToggleDot on={Boolean(sd?.cutlery)} />
            </button>
            <div className={card}>
              <p className={label}><Wallet className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Budget estimé (XAF)" : "Budget estimate (XAF)"}</p>
              <p className="mb-1 text-[11px] text-mist-500">{fr ? "Total estimé de votre commande" : "Estimated total for your order"}</p>
              <input className={input} type="number" min={0} step={500} inputMode="numeric" placeholder={fr ? "ex. 5 000" : "e.g. 5,000"} {...register("serviceDetails.budgetXaf" as never)} />
            </div>
          </div>
          <div className={card}>
            <DeliveryTimeField
              accent={ACCENT}
              fr={fr}
              label={fr ? "Heure de livraison souhaitée" : "Preferred delivery time"}
              value={watch("preferredDeliveryTime")}
              onChange={(v) => setValue("preferredDeliveryTime", v)}
            />
          </div>
        </div>

        {/* Delivery address + recipient phone */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={label}><MapPin className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Adresse de livraison" : "Delivery address"}</p>
            <p className="mb-2 text-[11px] text-mist-500">{fr ? "Où livrer le repas ?" : "Where should we deliver the food?"}</p>
            <SavedAddresses current={deliverySel} onPick={(l) => applySel("delivery", l)} accent={ACCENT} fr={fr} />
            <LocationField label={fr ? "Adresse de livraison" : "Delivery address"} accent={ACCENT} value={deliverySel} error={missing.includes(fr ? "Adresse de livraison" : "Delivery address")} onChange={(l) => applySel("delivery", l)} />
          </div>
          <div className={card}>
            <p className={label}><Phone className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Numéro du destinataire" : "Recipient phone number"}</p>
            <p className="mb-2 text-[11px] text-mist-500">{fr ? "Qui recevra la commande ?" : "Who will receive the order?"}</p>
            <div className="flex">
              <PhonePrefix />
              <input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" data-error={missing.includes(fr ? "Numéro du destinataire" : "Recipient phone number") ? "true" : undefined} {...register("whatsappNumber")} />
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className={card}>
          <p className={cn(label, "mb-3")}><Banknote className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Mode de paiement" : "Payment method"} <span className="text-mist-500">{fr ? "Comment payer ?" : "How would you like to pay?"}</span></p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { v: "CASH", t: fr ? "Espèces" : "Cash", s: fr ? "À la livraison" : "Pay on delivery" },
              { v: "MTN_MOMO", t: "MTN MoMo", s: fr ? "MTN Mobile Money" : "Pay with MTN Mobile Money" },
              { v: "ORANGE_MONEY", t: "Orange Money", s: fr ? "Orange Money" : "Pay with Orange Money" },
            ].map((p) => (
              <button key={p.v} type="button" onClick={() => setValue("paymentMethod", p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")}
                className={cn("rounded-xl border p-3 text-left", payment === p.v ? "border-amber-400 bg-amber-500/10" : "border-ink-700 bg-ink-800")}>
                <span className={cn("block text-sm font-semibold", payment === p.v ? "text-amber-200" : "text-mist-200")}>{p.t}</span>
                <span className="block text-[11px] text-mist-500">{p.s}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Extra instructions */}
        <div className={card}>
          <p className={label}><ClipboardList className="h-3.5 w-3.5 text-amber-300" /> {fr ? "Instructions supplémentaires" : "Extra instructions"} <span className="text-mist-500">{fr ? "Autre chose à savoir ?" : "Anything else we should know?"}</span></p>
          <textarea maxLength={250} className={cn(input, "mt-2 min-h-20 resize-y")} placeholder={fr ? "ex. Appelez en arrivant, code du portail, instructions…" : "e.g. Call me when you arrive, gate code, special instructions…"} {...register("specialInstructions")} />
          <p className="mt-1 text-right text-[11px] text-mist-500">{(watch("specialInstructions")?.length ?? 0)}/250</p>
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

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-amber-500/30 bg-ink-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {estimatedFee != null && (
          <div className="mx-auto mb-2 flex max-w-xl items-center justify-between rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2">
            <span className="text-xs text-mist-400">{fr ? "Frais de livraison estimés" : "Estimated delivery fee"}</span>
            <span className="font-display text-base font-bold text-mist-100">{estimatedFee.toLocaleString("fr-FR")} XAF</span>
          </div>
        )}
        <button type="submit" className="mx-auto flex w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3.5 font-display text-base font-bold text-ink-950">
          <ShoppingBasket className="h-5 w-5" />
          <span>{fr ? "Vérifier la commande" : "Review order summary"}</span>
          <ChevronRight className="h-5 w-5" />
        </button>
        <p className="mt-1.5 text-center text-[11px] text-mist-500"><ShieldCheck className="mr-1 inline h-3 w-3 text-amber-400" />{fr ? "Votre commande est protégée. Traitée avec soin." : "Your order is protected. We handle it with care."}</p>
      </div>
    </form>
  );
}

function ToggleDot({ on }: { on: boolean }) {
  return (
    <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-amber-400" : "bg-ink-700")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
    </span>
  );
}
