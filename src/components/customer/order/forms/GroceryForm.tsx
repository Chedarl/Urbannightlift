"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, ShoppingBasket, Store, ShoppingCart, Trash2, Plus, Minus, Repeat, Wallet, MapPin, Phone, Banknote, ClipboardList, ChevronRight, ShieldCheck, Apple, Milk, Cookie, CupSoda, Home, Package,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { decideAutoPrice } from "@/lib/orders/autoPrice";
import { priceCopy } from "@/lib/orders/priceCopy";
import { estimateDeliveryFee, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { LocationField } from "@/components/customer/location/LocationField";
import { TermsCheckbox } from "@/components/customer/order/fields/TermsCheckbox";
import { DeliveryTimeField } from "@/components/customer/order/fields/DeliveryTimeField";
import { SavedAddresses } from "@/components/customer/order/fields/SavedAddresses";
import { MoreDetails } from "@/components/customer/order/fields/MoreDetails";
import { SpendingCapField } from "@/components/customer/order/fields/SpendingCapField";
import { WelcomeBack } from "@/components/customer/order/fields/WelcomeBack";
import { VoiceNoteField } from "@/components/customer/order/fields/VoiceNoteField";
import { isRealName, localPhone, useProfilePrefill, useDeliverToAddress } from "@/lib/account/profile";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { cn } from "@/lib/utils";

const ACCENT = "#22c55e";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const input = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-green-400 focus:outline-none";

interface GItem { name: string; qty: number; brand: string; notes: string }
const CATS = [
  { v: "produce", icon: Apple, en: "Produce", fr: "Frais" },
  { v: "pantry", icon: Package, en: "Pantry", fr: "Épicerie" },
  { v: "dairy", icon: Milk, en: "Dairy", fr: "Laitier" },
  { v: "snacks", icon: Cookie, en: "Snacks", fr: "Snacks" },
  { v: "drinks", icon: CupSoda, en: "Drinks", fr: "Boissons" },
  { v: "household", icon: Home, en: "Household", fr: "Maison" },
];

export function GroceryForm() {
  const { locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();

  const [pickupSel, setPickupSel] = useState<SelectedLocation | null>(null);
  const [deliverySel, setDeliverySel] = useState<SelectedLocation | null>(null);
  // "Deliver here" from a portal saved-place tap (?deliverTo=…) — a real
  // shortcut, distinct from the plain Order tab.
  useDeliverToAddress((l) => applySel("delivery", l));
  const [zones, setZones] = useState<{ id: string; zoneName: string; tier: ZoneTier; feeXaf: number }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [cat, setCat] = useState("produce");

  const { register, handleSubmit, watch, setValue, getValues, control } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema) as Resolver<OrderInput>,
    defaultValues: {
      preferredLanguage: fr ? "FR" : "EN", serviceType: "GROCERY_PICKUP", fullName: fr ? "Client" : "Customer",
      quantity: 1, declaredValueXaf: 0, itemAlreadyPaid: false, riderPaysAtPickup: false,
      isFragile: false, needsTemperatureCare: false, isMedicine: false, paymentMethod: "CASH",
      acceptedTerms: undefined as unknown as true,
      serviceDetails: { shoppingType: "SUPERMARKET", substituteOk: true, bagSize: "MEDIUM", groceryItems: [{ name: "", qty: 1, brand: "", notes: "" }] },
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "serviceDetails.groceryItems" as never });
  const sd = watch("serviceDetails") as Record<string, unknown> | undefined;
  const items = (sd?.groceryItems as GItem[] | undefined) ?? [];
  const shoppingType = (sd?.shoppingType as string) ?? "SUPERMARKET";
  const bagSize = (sd?.bagSize as string) ?? "MEDIUM";
  const payment = watch("paymentMethod");

  useProfilePrefill((p) => {
    if (isRealName(p.fullName)) setValue("fullName", p.fullName);
    if (!getValues("whatsappNumber")) setValue("whatsappNumber", localPhone(p.whatsappNumber), { shouldValidate: true });
  });

  useEffect(() => { fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {}); }, []);
  useEffect(() => {
    const text = items.filter((m) => m?.name).map((m) => `${m.qty || 1}× ${m.name}${m.brand ? ` (${m.brand})` : ""}`).join(", ");
    if (text) setValue("itemDescription", text, { shouldValidate: true });
  }, [items, setValue]);

  const effZone = (sel: SelectedLocation | null) => sel?.zoneId ? { id: sel.zoneId, feeXaf: sel.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (sel.tier ?? "GREEN") as ZoneTier } : null;
  const estimatedFee = useMemo(() => estimateDeliveryFee(effZone(pickupSel), effZone(deliverySel)), [pickupSel, deliverySel]);
  /**
   * Whether that fee is the final zone tariff, using the same rule the server
   * applies on submit. It drives wording only, and it can only ever be more
   * optimistic than the server on a safety-flagged zone (data the client does
   * not hold) — in which case the order simply takes the normal quote path and
   * the confirmation screen, which is authoritative, says so.
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
  function setQty(i: number, delta: number) {
    const cur = Number(items[i]?.qty || 1);
    setValue(`serviceDetails.groceryItems.${i}.qty` as never, Math.max(1, cur + delta) as never, { shouldValidate: true });
  }

  function onSubmit(data: OrderInput) {
    setMissing([]);
    for (const sel of [pickupSel, deliverySel]) if (sel && SERVICE_STATUS_META[sel.serviceStatus] && !SERVICE_STATUS_META[sel.serviceStatus].ok) { setMissing([fr ? "Un lieu sélectionné n'est pas desservi." : "A selected location isn't serviceable."]); return; }
    const phone = (data.whatsappNumber ?? "").trim();
    saveDraft({
      ...data, fullName: data.fullName?.trim() || (fr ? `Client ${phone}` : `Customer ${phone}`),
      pickupLat: pickupSel?.latitude ?? null, pickupLng: pickupSel?.longitude ?? null,
      deliveryLat: deliverySel?.latitude ?? null, deliveryLng: deliverySel?.longitude ?? null,
      estimatedFeeXaf: estimatedFee, priceFirm, pickupZoneName: pickupSel?.zoneName ?? undefined, deliveryZoneName: deliverySel?.zoneName ?? undefined,
    });
    router.push("/order/review");
  }
  function onInvalid(errs: Record<string, unknown>) {
    const labels: Record<string, string> = {
      goodsCapXaf: fr ? "Plafond de dépense" : "Spending cap",
      acceptedTerms: fr ? "Accepter les conditions" : "Accept the terms",
      whatsappNumber: fr ? "Numéro du destinataire" : "Recipient phone number",
      pickupLocation: fr ? "Lieu du magasin" : "Store location",
      deliveryLocation: fr ? "Adresse de livraison" : "Delivery address",
      itemDescription: fr ? "Liste de courses" : "Grocery list",
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
      <div className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-b from-green-500/25 via-emerald-600/10 to-transparent px-5 pb-7 pt-4">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/15 text-green-300"><ShoppingBasket className="h-8 w-8" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">{fr ? "Courses" : "Grocery pickup"}</h1>
            <p className="mt-1 text-sm font-medium text-green-300">{fr ? "Étape 1 sur 3" : "Step 1 of 3"} <span className="text-mist-400">· {fr ? "Détails des achats" : "Shopping details"}</span></p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-5">
        <WelcomeBack accent={ACCENT} fr={fr} />

        {/* Store name + location */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={label}><Store className="h-3.5 w-3.5 text-green-300" /> {fr ? "Nom du magasin / marché" : "Store / market name"}</p>
            <input className={cn(input, "mt-2")} placeholder={fr ? "ex. Carrefour, Super U" : "e.g. Carrefour, Super U, Prince Market"} {...register("serviceDetails.storeName" as never)} />
          </div>
          <div className={card}>
            <p className={cn(label, "mb-2")}><MapPin className="h-3.5 w-3.5 text-green-300" /> {fr ? "Lieu du magasin" : "Store location"}</p>
            <LocationField mode="pickup" label={fr ? "Lieu du magasin" : "Store location"} accent={ACCENT} value={pickupSel} error={missing.includes(fr ? "Lieu du magasin" : "Store location")} onChange={(l) => applySel("pickup", l)} />
          </div>
        </div>

        {/* Shopping type */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><ShoppingBasket className="h-3.5 w-3.5 text-green-300" /> {fr ? "Type d'achat" : "Shopping type"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ v: "SUPERMARKET", icon: ShoppingCart, en: "Supermarket", fr: "Supermarché" }, { v: "LOCAL_MARKET", icon: Store, en: "Local market", fr: "Marché local" }, { v: "MINI_SHOP", icon: Home, en: "Mini shop", fr: "Petite boutique" }].map((o) => (
              <button key={o.v} type="button" onClick={() => setValue("serviceDetails.shoppingType" as never, o.v as never)}
                className={cn("flex items-center gap-2 rounded-xl border p-3", shoppingType === o.v ? "border-green-400 bg-green-500/10 text-green-200" : "border-ink-700 bg-ink-800 text-mist-300")}>
                <o.icon className="h-4 w-4" /> <span className="text-sm font-medium">{fr ? o.fr : o.en}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grocery list builder */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><ShoppingBasket className="h-3.5 w-3.5 text-green-300" /> {fr ? "Liste de courses" : "Grocery list builder"}</p>
          <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
            {CATS.map((c) => (
              <button key={c.v} type="button" onClick={() => setCat(c.v)}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium", cat === c.v ? "border-green-400 bg-green-500/15 text-green-200" : "border-ink-700 bg-ink-800 text-mist-400")}>
                <c.icon className="h-3.5 w-3.5" /> {fr ? c.fr : c.en}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1.4fr_auto_1fr_1fr_auto] items-center gap-2">
                <input className={input} placeholder={fr ? "Bananes" : "Bananas"} {...register(`serviceDetails.groceryItems.${i}.name` as never)} />
                <div className="flex items-center rounded-xl border border-ink-700 bg-ink-800">
                  <button type="button" onClick={() => setQty(i, -1)} className="px-2 py-2 text-mist-400"><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center text-sm text-mist-100">{items[i]?.qty || 1}</span>
                  <button type="button" onClick={() => setQty(i, 1)} className="px-2 py-2 text-green-300"><Plus className="h-4 w-4" /></button>
                </div>
                <input className={input} placeholder={fr ? "Marque" : "Brand"} {...register(`serviceDetails.groceryItems.${i}.brand` as never)} />
                <input className={input} placeholder="Notes" {...register(`serviceDetails.groceryItems.${i}.notes` as never)} />
                <button type="button" onClick={() => remove(i)} className="p-1.5 text-mist-500 hover:text-restricted" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => append({ name: "", qty: 1, brand: "", notes: "" } as never)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-green-500/40 py-2.5 text-sm font-medium text-green-300"><Plus className="h-4 w-4" /> {fr ? "Ajouter un article" : "Add another item"}</button>
          {missing.includes(fr ? "Liste de courses" : "Grocery list") && <p data-error="true" className="mt-2 text-xs text-restricted">{fr ? "Ajoutez au moins un article." : "Add at least one item."}</p>}
        </div>

        {/* Everything optional, folded away. The fields stay mounted inside the
            disclosure, so nothing typed is lost and validation still sees it. */}
        {/* The most we may spend for them. Required, and in the main column:
            it is a money term, not a preference. */}
        <SpendingCapField
          accent={ACCENT}
          fr={fr}
          value={watch("goodsCapXaf")}
          onChange={(v) => setValue("goodsCapXaf", v, { shouldValidate: true })}
          error={missing.includes(fr ? "Plafond de dépense" : "Spending cap")}
          suggestion={fr ? "ex. 25 000" : "e.g. 25,000"}
        />

        <MoreDetails accent={ACCENT} fr={fr}>
          <VoiceNoteField
            accent={ACCENT}
            fr={fr}
            onChange={(n) => {
              setValue("voiceNoteUrl", n?.url ?? "");
              setValue("voiceNoteSeconds", n?.seconds ?? null);
            }}
          />

        {/* Substitutions */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => setValue("serviceDetails.substituteOk" as never, (!sd?.substituteOk) as never)} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2"><Repeat className="h-4 w-4 text-green-300" /><span><span className="block text-sm text-mist-100">{fr ? "Substitutions autorisées" : "Allow substitutions"}</span><span className="block text-[11px] text-mist-500">{fr ? "Si un article est indisponible" : "If an item is unavailable"}</span></span></span>
            <ToggleDot on={Boolean(sd?.substituteOk)} />
          </button>
          <div className={card}>
            <p className={label}>{fr ? "Préférence de substitution" : "Substitute preference"}</p>
            <input className={cn(input, "mt-2")} placeholder={fr ? "ex. marque similaire, plus grand" : "e.g. similar brand, bigger size"} {...register("serviceDetails.substitutePref" as never)} />
          </div>
        </div>

        {/* Budget + time */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={label}><Wallet className="h-3.5 w-3.5 text-green-300" /> {fr ? "Plafond budget (XAF)" : "Budget cap (XAF)"}</p>
            <input className={cn(input, "mt-2")} type="number" min={0} step={500} inputMode="numeric" placeholder={fr ? "ex. 25 000" : "e.g. 25,000"} {...register("serviceDetails.budgetXaf" as never)} />
          </div>
          <div className={card}>
            <DeliveryTimeField
              accent={ACCENT}
              fr={fr}
              label={fr ? "Heure de livraison souhaitée" : "Preferred pickup / delivery time"}
              value={watch("preferredDeliveryTime")}
              onChange={(v) => setValue("preferredDeliveryTime", v)}
            />
          </div>
        </div>

        </MoreDetails>

        {/* Delivery + phone */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={cn(label, "mb-2")}><MapPin className="h-3.5 w-3.5 text-green-300" /> {fr ? "Adresse de livraison" : "Delivery address"}</p>
            <SavedAddresses current={deliverySel} onPick={(l) => applySel("delivery", l)} accent={ACCENT} fr={fr} />
            <LocationField label={fr ? "Adresse de livraison" : "Delivery address"} accent={ACCENT} value={deliverySel} error={missing.includes(fr ? "Adresse de livraison" : "Delivery address")} onChange={(l) => applySel("delivery", l)} />
          </div>
          <div className={card}>
            <p className={label}><Phone className="h-3.5 w-3.5 text-green-300" /> {fr ? "Numéro du destinataire" : "Recipient phone number"}</p>
            <div className="mt-2 flex"><PhonePrefix /><input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" data-error={missing.includes(fr ? "Numéro du destinataire" : "Recipient phone number") ? "true" : undefined} {...register("whatsappNumber")} /></div>
          </div>
        </div>

        {/* Bag size + payment */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className={cn(label, "mb-2")}>{fr ? "Nombre de sacs / charge" : "Bag count / load size"}</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: "SMALL", t: fr ? "Petit" : "Small", s: "1–3" }, { v: "MEDIUM", t: fr ? "Moyen" : "Medium", s: "4–8" }, { v: "LARGE", t: fr ? "Grand" : "Large", s: "9+" }].map((o) => (
                <button key={o.v} type="button" onClick={() => setValue("serviceDetails.bagSize" as never, o.v as never)} className={cn("rounded-xl border px-2 py-2 text-center", bagSize === o.v ? "border-green-400 bg-green-500/10 text-green-200" : "border-ink-700 bg-ink-800 text-mist-300")}>
                  <span className="block text-sm font-semibold">{o.t}</span><span className="block text-[10px] text-mist-500">{o.s} {fr ? "sacs" : "bags"}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={card}>
            <p className={cn(label, "mb-2")}><Banknote className="h-3.5 w-3.5 text-green-300" /> {fr ? "Mode de paiement" : "Payment method"}</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: "CASH", t: fr ? "Espèces" : "Cash" }, { v: "MTN_MOMO", t: "MTN MoMo" }, { v: "ORANGE_MONEY", t: "Orange" }].map((p) => (
                <button key={p.v} type="button" onClick={() => setValue("paymentMethod", p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")} className={cn("rounded-xl border px-2 py-2.5 text-xs font-semibold", payment === p.v ? "border-green-400 bg-green-500/10 text-green-200" : "border-ink-700 bg-ink-800 text-mist-300")}>{p.t}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Extra instructions */}
        <div className={card}>
          <p className={label}><ClipboardList className="h-3.5 w-3.5 text-green-300" /> {fr ? "Instructions supplémentaires" : "Extra instructions"}</p>
          <textarea maxLength={250} className={cn(input, "mt-2 min-h-20 resize-y")} placeholder={fr ? "ex. Vérifiez les dates, appelez si indisponible…" : "e.g. Check expiry dates, call me if something is unavailable…"} {...register("specialInstructions")} />
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-green-500/30 bg-ink-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {/* The price rides on the button, and says whether it is final. */}
        {estimatedFee != null && (
          <div className="mx-auto mb-2 flex max-w-xl items-center justify-between rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2">
            <span className="text-xs text-mist-400">{priceCopy(priceFirm, fr, true).label}</span>
            <span className="font-display text-base font-bold text-mist-100">{estimatedFee.toLocaleString("fr-FR")} XAF</span>
          </div>
        )}
        <button type="submit" className="mx-auto flex w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-green-400 py-3.5 font-display text-base font-bold text-ink-950">
          <ShoppingBasket className="h-5 w-5" /><span>{fr ? "Vérifier la commande" : "Review order summary"}</span><ChevronRight className="h-5 w-5" />
        </button>
        <p className="mt-1.5 text-center text-[11px] text-mist-500"><ShieldCheck className="mr-1 inline h-3 w-3 text-green-400" />{fr ? "Votre commande est protégée. Traitée avec soin." : "Your order is protected. We handle it with care."}</p>
      </div>
    </form>
  );
}

function ToggleDot({ on }: { on: boolean }) {
  return <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-green-400" : "bg-ink-700")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} /></span>;
}
