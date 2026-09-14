"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, Search, Store } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LocationField } from "@/components/customer/location/LocationField";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { useIntakePrefill, keepTyped } from "@/lib/orders/intakePrefill";
import { formatXaf } from "@/lib/utils";
import type { SelectedLocation } from "@/lib/locations/types";
import type { FoodMerchant } from "@/app/api/food/browse/route";
import { RestaurantCard } from "@/components/customer/food/RestaurantCard";
import type { PaymentMethod } from "@prisma/client";
import { usePaymentMethods } from "@/lib/payments/usePaymentMethods";

/**
 * Browsing food, from the businesses we have actually confirmed exist.
 *
 * ## What this replaced, and why it had to go
 *
 * The previous version of this screen shipped **three invented restaurants** —
 * names, street addresses, ratings, delivery times, menus and prices, all
 * fabricated, illustrated with hot-linked stock photography. It was live: every
 * food order went through it. A customer could order a named dish at a named
 * price from a business that may not exist, and a rider would be sent to an
 * invented street to collect it.
 *
 * That is the failure the OpenStreetMap import caused, which the owner caught
 * by checking the places themselves and which v12 deleted an entire catalogue
 * to undo — except worse, because that import contained real businesses that
 * had closed, while this invented the businesses.
 *
 * It also passed `subtotal + 1500` as `estimatedFeeXaf` and marked it firm, so
 * a 6,500 XAF meal was shown as an 8,000 XAF *delivery fee*. And it pre-filled
 * the customer's name and phone with placeholder values that submitted as-is,
 * creating orders against a contact number nobody owns.
 *
 * ## The rule this screen runs on
 *
 * **Nothing appears here unless a human confirmed the business exists.** When
 * nobody has been confirmed yet, the honest thing is to say so and take the
 * order anyway by asking where to go — which is what the second half of this
 * screen does. An empty catalogue must never be filled in by the interface.
 */

const ACCENT = "#f59e0b";

interface CartLine {
  merchantId: string;
  merchantName: string;
  itemId: string;
  name: string;
  priceXaf: number | null;
  quantity: number;
}

export function FoodForm() {
  const { locale } = useTranslation();
  // Never offer a way to pay that has no merchant code behind it.
  const payMethods = usePaymentMethods();
  const fr = locale === "fr";
  const router = useRouter();

  const [merchants, setMerchants] = useState<FoodMerchant[] | null>(null);
  const [query, setQuery] = useState("");
  /**
   * "Who is actually cooking right now."
   *
   * At 1 AM that is the only question, and the browse route already sorts open
   * restaurants first — but sorted-first still means scrolling past nine closed
   * ones on a phone. Off by default, because a closed kitchen we can call in
   * the morning is still worth seeing.
   */
  const [openOnly, setOpenOnly] = useState(false);
  const [openMerchantId, setOpenMerchantId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});

  // The free-text path, used when the catalogue has nothing for them — which is
  // the normal state until merchants have been called and verified.
  const [vendorName, setVendorName] = useState("");
  const [freeItems, setFreeItems] = useState("");
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);

  const [delivery, setDelivery] = useState<SelectedLocation | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [attempted, setAttempted] = useState(false);

  /*
   * What the customer typed in the intake box upstairs, if that is how they got
   * here. Until now this screen ignored it entirely and they retyped the lot.
   */
  const intake = useIntakePrefill("FOOD_PICKUP");
  useEffect(() => {
    if (!intake) return;
    setVendorName((v) => keepTyped(v, intake.pickupSuggestion));
    setFreeItems((v) => keepTyped(v, intake.itemDescription));
    setNotes((v) => keepTyped(v, intake.notes));
  }, [intake]);

  useEffect(() => {
    let live = true;
    fetch("/api/food/browse")
      .then((r) => (r.ok ? r.json() : { merchants: [] }))
      .then((d) => {
        if (!live) return;
        setMerchants(d.merchants ?? []);
        if (d.merchants?.length) setOpenMerchantId(d.merchants[0].id);
      })
      .catch(() => live && setMerchants([]));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (!merchants) return [];
    const q = query.trim().toLowerCase();
    return merchants.filter((m) => {
      if (openOnly && !m.openNow) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.neighbourhood ?? "").toLowerCase().includes(q) ||
        m.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [merchants, query, openOnly]);

  const openCount = useMemo(() => (merchants ?? []).filter((m) => m.openNow).length, [merchants]);

  const lines = useMemo<CartLine[]>(() => {
    if (!merchants) return [];
    const out: CartLine[] = [];
    for (const m of merchants) {
      for (const item of m.items) {
        const qty = cart[item.id];
        if (!qty) continue;
        out.push({
          merchantId: m.id,
          merchantName: m.name,
          itemId: item.id,
          name: (fr && item.nameFr) || item.name,
          priceXaf: item.priceXaf,
          quantity: qty,
        });
      }
    }
    return out;
  }, [cart, merchants, fr]);

  // What the shop will charge, as far as we know it. Deliberately never called
  // a total and never passed as the delivery fee — those are different numbers
  // and conflating them is what put an 8,000 XAF "fee" on a 6,500 XAF meal.
  const goodsEstimateXaf = lines.reduce((sum, l) => sum + (l.priceXaf ?? 0) * l.quantity, 0);
  const anyPriceUnknown = lines.some((l) => l.priceXaf == null);

  const browsing = lines.length > 0;
  const usingFreeText = !browsing && (vendorName.trim().length > 0 || freeItems.trim().length > 0);

  const missing: string[] = [];
  if (!browsing && !usingFreeText) missing.push(fr ? "ce que vous voulez" : "what you want");
  if (usingFreeText && !vendorName.trim()) missing.push(fr ? "le restaurant" : "the restaurant");
  if (usingFreeText && !pickup) missing.push(fr ? "où le récupérer" : "where to collect it");
  if (!delivery) missing.push(fr ? "où livrer" : "where to deliver");
  if (fullName.trim().length < 2) missing.push(fr ? "votre nom" : "your name");
  if (phone.replace(/\D/g, "").length < 8) missing.push(fr ? "votre WhatsApp" : "your WhatsApp");
  const ready = missing.length === 0;

  function bump(itemId: string, by: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + by);
      const copy = { ...prev };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  function submitOrder() {
    setAttempted(true);
    if (!ready) return;

    const shop = browsing ? lines[0] : null;
    const itemDescription = browsing
      ? lines.map((l) => `${l.quantity}× ${l.name}`).join(" · ")
      : freeItems.trim();

    const draft: OrderDraft = {
      fullName: fullName.trim(),
      whatsappNumber: phone.trim(),
      preferredLanguage: fr ? "FR" : "EN",
      serviceType: "FOOD_PICKUP",
      merchantId: shop?.merchantId ?? "",
      pickupLocation: browsing ? shop!.merchantName : (pickup?.primaryName ?? vendorName.trim()),
      pickupLandmark: browsing ? "" : (pickup?.landmark ?? ""),
      deliveryLocation: delivery?.primaryName ?? "",
      deliveryLandmark: delivery?.landmark ?? "",
      pickupZoneId: browsing ? "" : (pickup?.zoneId ?? ""),
      deliveryZoneId: delivery?.zoneId ?? "",
      pickupLat: browsing ? null : (pickup?.latitude ?? null),
      pickupLng: browsing ? null : (pickup?.longitude ?? null),
      deliveryLat: delivery?.latitude ?? null,
      deliveryLng: delivery?.longitude ?? null,
      itemDescription,
      serviceDetails: {
        vendorName: browsing ? shop!.merchantName : vendorName.trim(),
        foodItems: browsing
          ? lines.map((l) => ({ name: l.name, qty: l.quantity, notes: "" }))
          : [{ name: itemDescription, qty: 1, notes: "" }],
        notes,
      },
      quantity: browsing ? lines.reduce((s, l) => s + l.quantity, 0) : 1,
      declaredValueXaf: 0,
      preferredDeliveryTime: "ASAP",
      specialInstructions: notes,
      itemAlreadyPaid: false,
      riderPaysAtPickup: true,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: false,
      paymentMethod,
      paymentPhone: phone.trim(),
      transactionReference: "",
      referralCode: "",
      // What the food is expected to cost, which is what a spending cap is for.
      // It is NOT the delivery fee and must never be handed over as one.
      goodsCapXaf: goodsEstimateXaf > 0 ? goodsEstimateXaf : 0,
      acceptedTerms: true,
      // Left for the server to decide from the delivery zone. The old screen
      // passed the cart total here and called it firm.
      estimatedFeeXaf: null,
      merchantName: browsing ? shop!.merchantName : vendorName.trim(),
      deliveryZoneName: delivery?.zoneName ?? "",
      priceFirm: false,
    };

    saveDraft(draft);
    router.push("/order/review");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
      <header className="mb-5">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-amber-300">
          <UtensilsCrossed className="h-4 w-4" /> {fr ? "Manger ce soir" : "Food tonight"}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-mist-100">
          {fr ? "Qu'est-ce qu'on vous apporte ?" : "What are we bringing you?"}
        </h1>
      </header>

      {merchants === null ? (
        /* Shaped like what is coming rather than a spinner. On Cameroonian
           mobile data this is on screen for a couple of seconds, and a page
           that already has the right silhouette feels loaded before it is. */
        <div className="flex flex-col gap-3" aria-busy="true">
          <span className="sr-only">{fr ? "Chargement…" : "Loading…"}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-ink-700 bg-ink-900">
              <div className="h-36 w-full animate-pulse bg-ink-800/70" />
              <div className="flex items-start gap-3 px-4 pb-4 pt-0">
                <div className="-mt-8 h-16 w-16 shrink-0 animate-pulse rounded-2xl border-2 border-ink-900 bg-ink-800" />
                <div className="flex-1 pt-2">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-ink-800" />
                  <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-ink-800/70" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : merchants.length === 0 ? (
        /* The honest empty state. Filling this in with invented restaurants is
           exactly what went wrong before, so it says what is true and then takes
           the order anyway. */
        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-mist-100">
            <Store className="h-4 w-4 text-amber-300" />
            {fr ? "Notre carte arrive" : "Our menu is on the way"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-mist-400">
            {fr
              ? "Nous ajoutons les restaurants un par un, après les avoir appelés — nous préférons une liste courte et vraie à une longue liste inventée. En attendant, dites-nous simplement où aller."
              : "We add restaurants one at a time, after calling them — we would rather show a short true list than a long invented one. Meanwhile, just tell us where to go."}
          </p>
        </section>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={fr ? "Chercher un plat ou un restaurant" : "Search a dish or a restaurant"}
              className="w-full rounded-xl border border-ink-700 bg-ink-900 py-2.5 pl-9 pr-3 text-sm text-mist-100 placeholder:text-mist-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Only offered when it would actually change the list. A filter that
              does nothing teaches people not to press filters. */}
          {openCount > 0 && openCount < merchants.length && (
            <div className="mb-3 flex gap-2">
              <FilterChip active={!openOnly} onClick={() => setOpenOnly(false)}>
                {fr ? `Tout (${merchants.length})` : `All (${merchants.length})`}
              </FilterChip>
              <FilterChip active={openOnly} onClick={() => setOpenOnly(true)}>
                {fr ? `Ouvert maintenant (${openCount})` : `Open now (${openCount})`}
              </FilterChip>
            </div>
          )}

          {shown.length === 0 ? (
            /* Searching for something nobody has is normal, and the page used
               to answer it with nothing at all — which reads as broken rather
               than as "not here". The free-text box below still takes it. */
            <p className="rounded-2xl border border-ink-700 bg-ink-900 px-4 py-5 text-center text-xs leading-relaxed text-mist-400">
              {fr
                ? "Rien ne correspond. Dites-nous quand même ce que vous voulez plus bas — nous allons le chercher."
                : "Nothing matches that. Tell us what you want below anyway — we will go and get it."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {shown.map((m) => (
                <RestaurantCard
                  key={m.id}
                  merchant={m}
                  fr={fr}
                  open={openMerchantId === m.id}
                  onToggle={() => setOpenMerchantId(openMerchantId === m.id ? null : m.id)}
                  quantities={cart}
                  onBump={bump}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Always available, whether the catalogue is empty or simply does not
          have the place they want. A customer must never be unable to order
          food because we have not finished calling restaurants. */}
      {!browsing && (
        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-sm font-semibold text-mist-100">
            {fr ? "Ou dites-nous simplement" : "Or just tell us"}
          </p>
          <label className="text-xs text-mist-500">
            {fr ? "Le restaurant" : "The restaurant"}
            <input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder={fr ? "Ex. Chez Maman Josephine" : "e.g. Chez Maman Josephine"}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-amber-400 focus:outline-none"
            />
          </label>
          <LocationField
            label={fr ? "Où le récupérer" : "Where to collect it"}
            value={pickup}
            onChange={setPickup}
            accent={ACCENT}
            mode="pickup"
            suggestion={intake?.pickupSuggestion}
          />
          <label className="text-xs text-mist-500">
            {fr ? "Ce que vous voulez" : "What you want"}
            <textarea
              value={freeItems}
              onChange={(e) => setFreeItems(e.target.value)}
              rows={2}
              placeholder={fr ? "2 poulets braisés, 1 jus d'ananas" : "2 grilled chicken, 1 pineapple juice"}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-amber-400 focus:outline-none"
            />
          </label>
        </section>
      )}

      <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <LocationField
          label={fr ? "Livrer à" : "Deliver to"}
          value={delivery}
          onChange={setDelivery}
          accent={ACCENT}
          mode="delivery"
          suggestion={intake?.deliverySuggestion}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-mist-500">
            {fr ? "Votre nom" : "Your name"}
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-amber-400 focus:outline-none"
            />
          </label>
          <label className="text-xs text-mist-500">
            {fr ? "Votre WhatsApp" : "Your WhatsApp"}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="6 90 00 00 00"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-amber-400 focus:outline-none"
            />
          </label>
        </div>
        <label className="text-xs text-mist-500">
          {fr ? "Autre chose ?" : "Anything else?"}
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={250}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-amber-400 focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          {(payMethods as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                paymentMethod === m
                  ? "border-amber-400 bg-amber-500/15 text-amber-200"
                  : "border-ink-700 text-mist-400"
              }`}
            >
              {m === "CASH" ? (fr ? "Espèces" : "Cash") : m === "MTN_MOMO" ? "MTN" : "Orange"}
            </button>
          ))}
        </div>
      </section>

      {/*
        z-30 and a safe-area inset, matching the other order forms.

        Without a z-index this footer sat *under* the bottom nav (z-40), so the
        two collided at the bottom of the screen on a phone — the price and the
        continue button half-hidden behind the tab bar. Without the inset it also
        ran into the home indicator on an iPhone.
      */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-950/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-xs">
            {goodsEstimateXaf > 0 ? (
              <>
                <p className="font-semibold text-mist-100">
                  {fr ? "Nourriture ≈ " : "Food ≈ "}
                  {formatXaf(goodsEstimateXaf)}
                  {anyPriceUnknown && (fr ? " + articles sans prix" : " + unpriced items")}
                </p>
                {/* Said here because it is the sentence that stops this reading
                    as a hidden markup: we charge the shop's price, and our
                    earning is the delivery, quoted separately on the next screen. */}
                <p className="text-mist-500">
                  {fr
                    ? "Prix du restaurant, sans marge. La livraison est calculée à l'écran suivant."
                    : "The restaurant's price, no markup. Delivery is worked out on the next screen."}
                </p>
              </>
            ) : (
              <p className="text-mist-500">
                {attempted && missing.length
                  ? `${fr ? "Il manque : " : "Still needed: "}${missing.join(", ")}`
                  : fr
                    ? "La livraison est calculée à l'écran suivant."
                    : "Delivery is worked out on the next screen."}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={submitOrder}
            className="shrink-0 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
            disabled={attempted && !ready}
          >
            {fr ? "Continuer" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-200"
          : "border-ink-700 text-mist-400 hover:text-mist-200"
      }`}
    >
      {children}
    </button>
  );
}
