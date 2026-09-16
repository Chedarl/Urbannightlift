"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Package, User, FileText, Smartphone, Shirt, MoreHorizontal, Scale, DollarSign,
  Wine, Lock, Camera, ClipboardList, Banknote, ShieldCheck, Signature, ShieldCheck as ShieldIcon,
  Store,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { orderSchema, type OrderInput } from "@/lib/validation/orderSchema";
import { decideAutoPrice } from "@/lib/orders/autoPrice";
import { quoteDeliveryFee, distanceKm, type ZoneTier } from "@/lib/orders/pricing";
import { saveDraft } from "@/lib/orders/draft";
import { LocationField } from "@/components/customer/location/LocationField";
import { MerchantField } from "@/components/customer/merchant/MerchantField";
import { useIntakePrefill, blank, asSentence } from "@/lib/orders/intakePrefill";
import { TermsCheckbox } from "@/components/customer/order/fields/TermsCheckbox";
import { DeliveryTimeField } from "@/components/customer/order/fields/DeliveryTimeField";
import { SavedAddresses } from "@/components/customer/order/fields/SavedAddresses";
import { MoreDetails } from "@/components/customer/order/fields/MoreDetails";
import { WelcomeBack } from "@/components/customer/order/fields/WelcomeBack";
import { VoiceNoteField } from "@/components/customer/order/fields/VoiceNoteField";
import { isRealName, localPhone, useProfilePrefill, useDeliverToAddress } from "@/lib/account/profile";
import { SERVICE_STATUS_META, type SelectedLocation } from "@/lib/locations/types";
import { cn, groupXaf } from "@/lib/utils";
import { usePaymentMethods } from "@/lib/payments/usePaymentMethods";
import { CartBar } from "@/components/customer/order/CartBar";
import { INSURED_VALUE_CAP_XAF } from "@/lib/i18n/legal";

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

const ACCENT = "#3b82f6";
const card = "rounded-2xl border border-ink-700 bg-ink-900/50 p-4";
const label = "flex items-center gap-1.5 text-xs font-medium text-mist-400";
const section = "text-xs font-semibold uppercase tracking-wide text-blue-300";
const input = "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-blue-400 focus:outline-none";

export function ParcelForm() {
  const { locale } = useTranslation();
  // Never offer a way to pay that has no merchant code behind it.
  const payMethods = usePaymentMethods();
  const fr = locale === "fr";
  const router = useRouter();

  const [pickupSel, setPickupSel] = useState<SelectedLocation | null>(null);
  /** Opened by the "collecting from a business?" link, and the name once chosen. */
  const [businessPickup, setBusinessPickup] = useState(false);
  const [pickupBusiness, setPickupBusiness] = useState("");
  const [deliverySel, setDeliverySel] = useState<SelectedLocation | null>(null);
  // "Deliver here" from a portal saved-place tap (?deliverTo=…) — a real
  // shortcut, distinct from the plain Order tab.
  useDeliverToAddress((l) => applySel("delivery", l));
  const [zones, setZones] = useState<{ id: string; zoneName: string; tier: ZoneTier; feeXaf: number }[]>([]);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  // The bar lives outside the field stack, so it asks the form to submit
  // itself rather than being a submit button that has to live inside it.
  const formRef = useRef<HTMLFormElement>(null);

  const { register, handleSubmit, watch, setValue, getValues } = useForm<OrderInput>({
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

  useProfilePrefill((p) => {
    if (isRealName(p.fullName)) setValue("fullName", p.fullName);
    if (!getValues("whatsappNumber")) setValue("whatsappNumber", localPhone(p.whatsappNumber), { shouldValidate: true });
  });

  /*
   * The intake sentence. `itemDescription` here is composed from the category
   * and size chips further down, so what they said about the parcel goes into
   * the instructions rather than fighting that composition for the same field.
   */
  const intake = useIntakePrefill("SMALL_PARCEL");
  useEffect(() => {
    if (!intake) return;
    const said = asSentence(intake);
    if (said && blank(getValues("specialInstructions"))) setValue("specialInstructions", said.slice(0, 200));
  }, [intake, getValues, setValue]);

  useEffect(() => { fetch("/api/zones").then((r) => r.json()).then((d) => setZones(d.zones ?? [])).catch(() => {}); }, []);
  useEffect(() => {
    const catLabel = CATS.find((c) => c.v === category);
    setValue("itemDescription", `${catLabel ? (fr ? catLabel.fr : catLabel.en) : "Parcel"} · ${size}`, { shouldValidate: true });
  }, [category, size, fr, setValue]);

  const effZone = (sel: SelectedLocation | null) => sel?.zoneId ? { id: sel.zoneId, feeXaf: sel.feeXaf ?? 0, medicineFeeXaf: 0, nightUrgencyFeeXaf: 0, tier: (sel.tier ?? "GREEN") as ZoneTier } : null;
  const fare = useMemo(() => quoteDeliveryFee(effZone(pickupSel), effZone(deliverySel), { pickup: pin(pickupSel), delivery: pin(deliverySel) }), [pickupSel, deliverySel]);
  const estimatedFee = fare?.totalXaf ?? null;

  /**
   * The ride, in kilometres, once both ends are pinned.
   *
   * Road-adjusted by the same 1.3 factor `quoteFare` applies, so the figure on
   * screen is the one the price was worked out from rather than a straight line
   * that makes the fee look arbitrary.
   */
  const routeKm = useMemo(() => {
    const a = pin(pickupSel);
    const b = pin(deliverySel);
    if (!a || !b) return null;
    return distanceKm(a.lat, a.lng, b.lat, b.lng) * 1.3;
  }, [pickupSel, deliverySel]);

  // What they said the parcel is worth, and whether that is beyond what we
  // would actually pay out. Both drive the cover line, which must never claim
  // more than the approved limit.
  const declaredValue = Number(watch("declaredValueXaf")) || 0;
  const overCap = declaredValue > INSURED_VALUE_CAP_XAF;
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
      /*
        A business named but not pinned still has to reach the rider.

        Picking one from the list or the map sets the pin, and its name is
        already the pickup location. Typing one by hand gives us a name and no
        coordinates — which cannot be priced and must not fill the pin — so it
        rides along in the landmark, where dispatch and the rider both read it.
        Without this the name sat on the screen and went nowhere, which is the
        kind of field that looks like it works.
      */
      pickupLandmark:
        pickupBusiness.trim() && !data.pickupLocation?.includes(pickupBusiness.trim())
          ? [pickupBusiness.trim(), data.pickupLandmark].filter(Boolean).join(" — ")
          : data.pickupLandmark,
      pickupLat: pickupSel?.latitude ?? null, pickupLng: pickupSel?.longitude ?? null,
      deliveryLat: deliverySel?.latitude ?? null, deliveryLng: deliverySel?.longitude ?? null,
      estimatedFeeXaf: estimatedFee, priceFirm,
      fareLines: fare?.lines, fareEstimated: fare?.estimated, pickupZoneName: pickupSel?.zoneName ?? undefined, deliveryZoneName: deliverySel?.zoneName ?? undefined,
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
      <div className="px-4 pb-3 pt-2">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold leading-tight">
          <Package className="h-5 w-5 text-blue-300" />
          {fr ? "Petit colis" : "Small parcel"}
        </h1>
      </div>

      <div className="flex flex-col gap-4 px-4">
        <WelcomeBack accent={ACCENT} fr={fr} />

        {/*
          ══ The route, first ══

          A food screen leads with a menu because that is the decision. A parcel
          has no menu: the decision is *where*, and the price follows entirely
          from it. So both ends go at the top, joined, with the distance visible
          **while you are still choosing** rather than revealed at checkout.

          They used to be buried — pickup at the bottom of a "Sender details"
          card, drop-off at the bottom of a "Receiver details" card, four fields
          apart — so the one thing that decides the fee was the last thing you
          saw. The names and numbers still matter and are asked below; they are
          simply not the first question.
        */}
        <div className={card}>
          <div className="flex gap-3">
            {/* The spine: violet at the pickup, gold at the drop, joined by the
                gradient between them. It is the same pairing the tracking map
                draws the route with, so the two screens read as one journey. */}
            <div aria-hidden className="flex shrink-0 flex-col items-center pt-2.5">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              <span className="my-1 w-0.5 flex-1 bg-gradient-to-b from-violet-400 to-gold-400" />
              <span className="h-2 w-2 rounded-full bg-gold-400" />
            </div>

            <div className="min-w-0 flex-1">
              <p className={cn(section, "mb-1.5")}>{fr ? "Ramassage" : "Pickup"}</p>
              <LocationField mode="pickup" label={fr ? "Adresse de ramassage" : "Pickup address"} accent={ACCENT} value={pickupSel} error={missing.includes(fr ? "Adresse de ramassage" : "Pickup address")} onChange={(l) => applySel("pickup", l)} suggestion={intake?.pickupSuggestion} />

              {/*
                "Collecting from a shop?" — behind a link, not in the way.

                Most parcels are collected from a person at an address, and that
                is the field above. But a real share of them are not: the phone
                repairer on Avenue Kennedy, the printer at Carrefour Emia, the
                shop holding something that was paid for. Naming the business
                gives the rider a door and a phone number instead of a street.

                Kept behind a link because the common case must not pay for the
                uncommon one, and the picker is a full-screen sheet.
              */}
              {!businessPickup ? (
                <button
                  type="button"
                  onClick={() => setBusinessPickup(true)}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-300"
                >
                  <Store className="h-3.5 w-3.5" />
                  {fr ? "Vous récupérez chez un commerce ?" : "Collecting from a business?"}
                </button>
              ) : (
                <div className="mt-2">
                  <MerchantField
                    category="OTHER"
                    accent={ACCENT}
                    cardAccent="violet"
                    fr={fr}
                    label={fr ? "Le commerce" : "The business"}
                    placeholder={fr ? "Ex. Quincaillerie Kennedy" : "e.g. ABC Electronics"}
                    value={pickupBusiness}
                    merchantId={null}
                    onPick={(m, loc) => {
                      setPickupBusiness(m.merchantName);
                      applySel("pickup", loc);
                    }}
                    onDiscovered={(b, loc) => {
                      setPickupBusiness(b.name);
                      applySel("pickup", loc);
                    }}
                    /*
                      Typed by hand it is only a name, so it is *not* accepted as
                      a location — the address field above stays in charge. A
                      word with no coordinates cannot be priced, and filling the
                      pin from one would mean inventing a fee.
                    */
                    onFreeText={setPickupBusiness}
                  />
                </div>
              )}

              <p className={cn(section, "mb-1.5 mt-4")}>{fr ? "Livraison" : "Drop-off"}</p>
              <SavedAddresses current={deliverySel} onPick={(l) => applySel("delivery", l)} accent={ACCENT} fr={fr} />
              <LocationField label={fr ? "Adresse de dépôt" : "Drop-off address"} accent={ACCENT} value={deliverySel} error={missing.includes(fr ? "Adresse de dépôt" : "Drop-off address")} onChange={(l) => applySel("delivery", l)} suggestion={intake?.deliverySuggestion} />
            </div>
          </div>

          {/*
            The distance, the moment both pins exist.

            This is the line that turns the fee from a rule into a reason. "You
            are 6.4 km away" can be argued with in a way "you are in the yellow
            zone" never could, and it is the same road-adjusted figure the fee
            is actually computed from.
          */}
          {routeKm != null && (
            <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3 text-xs tabular-nums text-mist-400">
              <span className="rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1">
                {routeKm.toFixed(1)} km {fr ? "par la route" : "by road"}
              </span>
              <span className="rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1">
                ≈ {Math.max(8, Math.round(routeKm * 3.4))} min
              </span>
              <span className="flex items-center gap-1 text-safe">
                <ShieldCheck className="h-3 w-3" />
                {fr ? "Épingles posées — suivi disponible" : "Both pins dropped — tracking works"}
              </span>
            </p>
          )}
        </div>

        {/* Who is sending, and who is receiving. Still asked, no longer first:
            the route decides the price and the tracking; the names decide who
            hands it over and who signs for it. */}
        <div className={card}>
          <p className={cn(section, "mb-3 flex items-center gap-1.5")}><User className="h-4 w-4" /> {fr ? "Expéditeur" : "Sender"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>{fr ? "Nom complet" : "Full name"}</p>
              <input className={cn(input, "mt-1")} placeholder={fr ? "ex. Jean Michel" : "e.g. Jean Michel"} {...register("serviceDetails.senderName" as never)} />
            </div>
            <div>
              <p className={label}>{fr ? "Téléphone" : "Phone number"}</p>
              <div className="mt-1 flex"><PhonePrefix /><input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" data-error={missing.includes(fr ? "Téléphone de l'expéditeur" : "Sender phone number") ? "true" : undefined} {...register("whatsappNumber")} /></div>
            </div>
          </div>

          <p className={cn(section, "mb-3 mt-5 flex items-center gap-1.5")}><User className="h-4 w-4" /> {fr ? "Destinataire" : "Receiver"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>{fr ? "Nom complet" : "Full name"}</p>
              <input className={cn(input, "mt-1")} placeholder={fr ? "ex. Marie Claire" : "e.g. Marie Claire"} {...register("serviceDetails.receiverName" as never)} />
            </div>
            <div>
              <p className={label}>{fr ? "Téléphone" : "Phone number"}</p>
              <div className="mt-1 flex"><PhonePrefix /><input className={cn(input, "rounded-l-none")} inputMode="tel" placeholder="6 90 12 34 56" {...register("serviceDetails.receiverPhone" as never)} /></div>
            </div>
          </div>
        </div>

        {/*
          What is inside, and how big, as chips.

          Typing is the enemy at 1 a.m. on a phone — and these were already
          taps, but wrapped in two bordered cards with their own headings: three
          rows of chrome for seven words. Chips say the same thing in two rows
          and read as a choice rather than a form.
        */}
        <div>
          <p className={cn(section, "mb-2")}>{fr ? "Ce qu'il y a dedans" : "What's inside"}</p>
          <div className="flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button key={c.v} type="button" onClick={() => setValue("serviceDetails.category" as never, c.v as never)} className={cn("flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors", category === c.v ? "border-blue-400 bg-blue-500/15 text-blue-200" : "border-ink-700 bg-ink-900 text-mist-400 hover:text-mist-200")}>
                <c.icon className="h-4 w-4" /> {fr ? c.fr : c.en}
              </button>
            ))}
          </div>

          <p className={cn(section, "mb-2 mt-4")}>{fr ? "Taille" : "Size"}</p>
          <div className="flex flex-wrap gap-2">
            {[{ v: "S", t: fr ? "Petit" : "Small" }, { v: "M", t: fr ? "Moyen" : "Medium" }, { v: "L", t: fr ? "Grand" : "Large" }].map((o) => (
              <button key={o.v} type="button" onClick={() => setValue("serviceDetails.size" as never, o.v as never)} className={cn("rounded-full border px-4 py-2 text-sm font-semibold transition-colors", size === o.v ? "border-blue-400 bg-blue-500/15 text-blue-200" : "border-ink-700 bg-ink-900 text-mist-400 hover:text-mist-200")}>{o.t}</button>
            ))}
          </div>
        </div>

        {/*
          ══ Declared value, and the cover it actually buys ══

          The field used to sit alone under the heading "Declared value (XAF)"
          and nothing on the screen said what declaring a value *gets* you. A
          customer typing 120,000 had every reason to believe they had just
          insured 120,000 XAF of phone. They had not: cover stops at
          `INSURED_VALUE_CAP_XAF`, and above it the order stops being auto-priced
          and goes to a person.

          So the cap is stated beside the figure rather than discovered in the
          terms, and the bar fills only as far as the cover reaches. This screen
          must never show an order as insured beyond what we would actually pay.
        */}
        <div className={card}>
          <p className={label}><DollarSign className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Valeur déclarée (XAF)" : "Declared value (XAF)"}</p>
          <input className={cn(input, "mt-2 tabular-nums")} type="number" min={0} step={500} inputMode="numeric" placeholder={fr ? "ex. 10 000" : "e.g. 10,000"} {...register("declaredValueXaf")} />

          <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink-800">
            <div
              className={cn("h-full rounded-full transition-all", overCap ? "bg-caution" : "bg-safe")}
              style={{ width: `${Math.min(100, (declaredValue / INSURED_VALUE_CAP_XAF) * 100)}%` }}
            />
          </div>
          <p className={cn("mt-2 flex items-start gap-1.5 text-xs leading-snug", overCap ? "text-caution" : "text-mist-400")}>
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {overCap
              ? fr
                ? `Au-dessus de notre plafond de ${groupXaf(INSURED_VALUE_CAP_XAF)} XAF. Nous prenons quand même l'envoi — une personne confirme le prix et ce qui est couvert avant le départ.`
                : `Above our ${groupXaf(INSURED_VALUE_CAP_XAF)} XAF cover limit. We will still carry it — a person confirms the price and what is covered before the rider sets off.`
              : fr
                ? `Couvert jusqu'à ${groupXaf(INSURED_VALUE_CAP_XAF)} XAF — notre plafond.`
                : `Covered up to ${groupXaf(INSURED_VALUE_CAP_XAF)} XAF — our limit.`}
          </p>
        </div>

        {/* Weight, on its own. It changes nothing about the price today and is
            asked so the rider knows what they are going to collect. */}
        <div className={card}>
          <p className={label}><Scale className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Poids approximatif" : "Rough weight"}</p>
          <div className="mt-2 flex">
            <input className={cn(input, "rounded-r-none tabular-nums")} type="number" min={0} step={0.1} inputMode="decimal" placeholder="0.5" {...register("serviceDetails.weight" as never)} />
            <span className="flex items-center rounded-r-xl border border-l-0 border-ink-700 bg-ink-800 px-3 text-sm text-mist-400">kg</span>
          </div>
        </div>

                {/* Everything optional, folded away. Fields stay mounted inside the
            disclosure, so nothing typed is lost and validation still sees it. */}
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
          <button type="button" onClick={() => setValue("isFragile", !watch("isFragile"))} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2"><Wine className="h-4 w-4 text-blue-300" /><span><span className="block text-sm text-mist-100">{fr ? "Fragile" : "Fragile"}</span><span className="block text-xs text-mist-500">{fr ? "Manipuler avec soin" : "Handle with extra care"}</span></span></span>
            <ToggleDot on={Boolean(watch("isFragile"))} />
          </button>
          <button type="button" onClick={() => setValue("serviceDetails.sealed" as never, (!sd?.sealed) as never)} className={cn(card, "flex items-center justify-between text-left")}>
            <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-blue-300" /><span><span className="block text-sm text-mist-100">{fr ? "Colis scellé" : "Sealed package"}</span><span className="block text-xs text-mist-500">{fr ? "Le colis est scellé" : "Package is sealed"}</span></span></span>
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
            <p className="mt-1 flex items-center gap-1 text-xs text-mist-500"><ShieldCheck className="h-3 w-3" /> {fr ? "Privé — jamais dans le PDF partagé." : "Private — never in the shared PDF."}</p>
          </div>
          <div className={card}>
            <DeliveryTimeField
              accent={ACCENT}
              fr={fr}
              label={fr ? "Heure de ramassage" : "Pickup time"}
              value={watch("preferredDeliveryTime")}
              onChange={(v) => setValue("preferredDeliveryTime", v)}
            />
          </div>
        </div>

        {/* Delivery note */}
        <div className={card}>
          <p className={label}><ClipboardList className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Note de livraison / repère" : "Delivery note / landmark"}</p>
          <textarea maxLength={200} className={cn(input, "mt-2 min-h-16 resize-y")} placeholder={fr ? "ex. Code du portail, nom du bâtiment, repère…" : "e.g. Gate code, building name, nearest landmark…"} {...register("specialInstructions")} />
          <p className="mt-1 text-right text-xs text-mist-500">{(watch("specialInstructions")?.length ?? 0)}/200</p>
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
        </MoreDetails>

        {/* Payment */}
        <div className={card}>
          <p className={cn(label, "mb-2")}><Banknote className="h-3.5 w-3.5 text-blue-300" /> {fr ? "Mode de paiement" : "Payment method"}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ v: "CASH", t: fr ? "Espèces" : "Cash", s: fr ? "À la livraison" : "Pay on delivery" }, { v: "MTN_MOMO", t: "MTN MoMo", s: "Mobile Money" }, { v: "ORANGE_MONEY", t: "Orange Money", s: "Orange Money" }].filter((p) => payMethods.includes(p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")).map((p) => (
              <button key={p.v} type="button" onClick={() => setValue("paymentMethod", p.v as "CASH" | "MTN_MOMO" | "ORANGE_MONEY")} className={cn("rounded-xl border p-3 text-left", payment === p.v ? "border-blue-400 bg-blue-500/10" : "border-ink-700 bg-ink-800")}>
                <span className={cn("block text-sm font-semibold", payment === p.v ? "text-blue-200" : "text-mist-200")}>{p.t}</span><span className="block text-xs text-mist-500">{p.s}</span>
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

      {/* The same bar as food and medicine — see `CartBar` for why all three
          services share one, and what it refuses to print. */}
      <CartBar
        fr={fr}
        accent="sky"
        glyph={
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/10">
            <Package className="h-5 w-5 text-blue-300" />
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
            ? "Posez les deux épingles pour voir le prix"
            : "Drop both pins to see the fee"
        }
        cta={fr ? "Vérifier" : "Review"}
        onCta={() => formRef.current?.requestSubmit()}
      />
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
