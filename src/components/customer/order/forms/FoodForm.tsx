"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, Search, Store, ShoppingBag, Pencil } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LocationField } from "@/components/customer/location/LocationField";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { useIntakePrefill, keepTyped } from "@/lib/orders/intakePrefill";
import type { SelectedLocation } from "@/lib/locations/types";
import type { FoodMerchant } from "@/app/api/food/browse/route";
import { MerchantRow } from "@/components/customer/food/MerchantRow";
import { MerchantMenu } from "@/components/customer/food/MerchantMenu";
import { CartBar } from "@/components/customer/order/CartBar";
import { useLiveFare } from "@/lib/orders/useLiveFare";
import { merchantToLocation } from "@/lib/locations/fromMerchant";
import { MerchantField } from "@/components/customer/merchant/MerchantField";
import { titleCase } from "@/lib/merchants/tags";
import type { PaymentMethod } from "@prisma/client";
import { usePaymentMethods } from "@/lib/payments/usePaymentMethods";

/**
 * Ordering food, rebuilt around how this is actually done at scale.
 *
 * ## The shape, and why it changed
 *
 * This was one long page: a stack of tall restaurant cards, one of which
 * unrolled a grid of dishes, and beneath all of it the delivery fields. Every
 * decision — which restaurant, which dishes, where to, who are you — lived on
 * the same scroll, so nothing ever felt finished and the menu was permanently
 * half-buried.
 *
 * Meituan and Ele.me, between them roughly ninety per cent of a market of a
 * billion people, both split it in two: **a list of places, then one place's
 * menu, full screen.** Choosing where to eat and choosing what to eat are
 * different decisions and they get different screens. That is this file's three
 * stages — `list`, `menu`, `details` — and it is the only structural change,
 * but it is the one that makes the rest possible.
 *
 * The specific borrowings, and the three things deliberately refused from the
 * same study, are documented on `MerchantMenu`.
 *
 * ## What did not change, because it is why this screen is trustworthy
 *
 * The previous version of this screen once shipped **three invented
 * restaurants** — names, street addresses, ratings, menus and prices, all
 * fabricated, illustrated with hot-linked stock photography — and it was live.
 * A customer could order a named dish at a named price from a business that may
 * not exist, and a rider would be sent to an invented street to collect it.
 *
 * So: **nothing appears here unless a human confirmed the business exists.**
 * When nobody has been confirmed yet, the honest thing is to say so and take
 * the order anyway by asking where to go — which is what the free-text path
 * does. An empty catalogue is never filled in by the interface.
 *
 * And the goods estimate is **never** passed as the delivery fee. They are
 * different numbers with different owners; conflating them once put an 8,000
 * XAF "delivery fee" on a 6,500 XAF meal.
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

type Stage = "list" | "menu" | "details";

export function FoodForm() {
  const { locale } = useTranslation();
  // Never offer a way to pay that has no merchant code behind it.
  const payMethods = usePaymentMethods();
  const fr = locale === "fr";
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("list");
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
  /**
   * "Brochettes", "Poisson", "Poulet" — what the restaurants here actually
   * cook, as a way into the list.
   *
   * Null is "everything". The categories are the merchants' own
   * `MerchantProduct.category` values, so this filter cannot offer a kind of
   * food nobody on the list sells.
   */
  const [dishCategory, setDishCategory] = useState<string | null>(null);
  const [openMerchantId, setOpenMerchantId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});

  // The free-text path, used when the catalogue has nothing for them — which is
  // the normal state until merchants have been called and verified.
  const [vendorName, setVendorName] = useState("");
  /**
   * Set only when they chose one of *our* restaurants from the picker.
   *
   * A business found on the map deliberately leaves this null: it is not a
   * merchant of ours, and an id here would attach the order to a catalogue row
   * that does not exist.
   */
  const [pickedMerchantId, setPickedMerchantId] = useState<string | null>(null);
  /**
   * The Google Place ID of a business found on the map, when that is what they
   * chose. The only thing about it the order carries: the server looks the rest
   * up itself rather than trusting a name and a pin from a browser.
   */
  const [pickedPlaceId, setPickedPlaceId] = useState<string | null>(null);
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
      if (dishCategory && !m.items.some((i) => titleCase((i.category ?? "").trim()) === dishCategory)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.neighbourhood ?? "").toLowerCase().includes(q) ||
        m.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [merchants, query, openOnly, dishCategory]);

  /**
   * The kinds of food on offer tonight, commonest first.
   *
   * Counted over restaurants rather than dishes: a place with thirty
   * brochettes and one fish should not make the list look like a brochette
   * street. Capped at six, because a chip row that wraps to three lines is a
   * menu of its own.
   */
  const dishCategories = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of merchants ?? []) {
      const here = new Set<string>();
      for (const i of m.items) {
        const c = titleCase((i.category ?? "").trim());
        if (c && c.length <= 18) here.add(c);
      }
      for (const c of here) count.set(c, (count.get(c) ?? 0) + 1);
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
  }, [merchants]);

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
  // a total and never passed as the delivery fee.
  const goodsEstimateXaf = lines.reduce((sum, l) => sum + (l.priceXaf ?? 0) * l.quantity, 0);
  const anyPriceUnknown = lines.some((l) => l.priceXaf == null);
  const cartCount = lines.reduce((n, l) => n + l.quantity, 0);

  const browsing = lines.length > 0;
  const usingFreeText = !browsing && (vendorName.trim().length > 0 || freeItems.trim().length > 0);

  const openMerchant = useMemo(
    () => (merchants ?? []).find((m) => m.id === openMerchantId) ?? null,
    [merchants, openMerchantId]
  );

  /*
   * The fee, quoted while they are still choosing rather than after.
   *
   * Food is an errand — the rider goes in, waits, pays, comes out — so it is
   * priced as one. The pickup end is the restaurant, whose zone we know once a
   * merchant is chosen; until then the delivery end alone gives an estimate.
   */
  const { quote, zones } = useLiveFare();

  /*
   * The restaurant the cart came from, as a pickup point.
   *
   * This is the defect this file shipped with. On the catalogue path the draft
   * set `pickupLat`, `pickupLng` and `pickupZoneId` to null — and
   * `quoteDeliveryFee` measures road distance from exactly those, so the path
   * we most want people to use was the one priced from a zone estimate, while
   * the merchant row it came from had coordinates on it. Worse, it was
   * invisible: the customer saw a plausible number and the rider got a name.
   *
   * `merchantToLocation` is the same converter the merchant picker and the
   * pharmacy list already use, so a restaurant reached by browsing and the same
   * restaurant reached by searching cannot be priced differently.
   *
   * A merchant with no pin yields null, and the form falls back to asking —
   * which is the free-text behaviour, and honest.
   */
  const cartMerchant = useMemo(
    () => (merchants ?? []).find((m) => m.id === lines[0]?.merchantId) ?? null,
    [merchants, lines]
  );
  const merchantPickup = useMemo<SelectedLocation | null>(() => {
    const m = cartMerchant;
    if (!m || m.latitude == null || m.longitude == null) return null;
    return merchantToLocation(
      {
        merchantName: m.name,
        neighbourhood: m.neighbourhood,
        address: m.address,
        landmark: m.landmark,
        latitude: m.latitude,
        longitude: m.longitude,
        phone: m.phone,
      },
      zones
    );
  }, [cartMerchant, zones]);

  /** The pin that is actually used, whichever path they took to it. */
  const effectivePickup = browsing ? merchantPickup : pickup;

  const fare = useMemo(
    () => quote({ pickup: effectivePickup, delivery, errand: true }),
    [quote, effectivePickup, delivery]
  );

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
      /*
        Either path can now name one of our own restaurants: the catalogue, by
        putting its dishes in the cart, or the picker on the free-text path. A
        business found on the map has no id and correctly sends none.
      */
      merchantId: shop?.merchantId ?? pickedMerchantId ?? "",
      // Sent only when no merchant of ours was chosen; the server ignores it
      // otherwise, because a row we have called always beats one we have not.
      placeId: pickedPlaceId ?? "",
      pickupLocation: browsing ? shop!.merchantName : (effectivePickup?.primaryName ?? vendorName.trim()),
      pickupLandmark: effectivePickup?.landmark ?? "",
      deliveryLocation: delivery?.primaryName ?? "",
      deliveryLandmark: delivery?.landmark ?? "",
      pickupZoneId: effectivePickup?.zoneId ?? "",
      deliveryZoneId: delivery?.zoneId ?? "",
      pickupLat: effectivePickup?.latitude ?? null,
      pickupLng: effectivePickup?.longitude ?? null,
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
      quantity: browsing ? cartCount : 1,
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
      // Left for the server to decide. The screen's live quote is the same
      // function with the same rules, but the server prices the order of record.
      estimatedFeeXaf: null,
      merchantName: browsing ? shop!.merchantName : vendorName.trim(),
      deliveryZoneName: delivery?.zoneName ?? "",
      priceFirm: false,
    };

    saveDraft(draft);
    router.push("/order/review");
  }

  /* ─── The menu, full screen ─────────────────────────────────────────────
     Its own stage rather than an accordion: picking a restaurant and picking
     dishes are different decisions, and a menu that shares a scroll with the
     delivery form is a menu nobody finishes. */
  if (stage === "menu" && openMerchant) {
    return (
      <div className="flex h-[100dvh] flex-col pb-[5.5rem]">
        <MerchantMenu
          merchant={openMerchant}
          fr={fr}
          quantities={cart}
          onBump={bump}
          onBack={() => setStage("list")}
          onAskFor={(name) => {
            // Carry the restaurant back to the free-text box rather than
            // leaving them on an empty menu with nothing to press.
            setVendorName(name);
            setStage("list");
            requestAnimationFrame(() =>
              document.getElementById("food-free-text")?.scrollIntoView({ behavior: "smooth", block: "center" })
            );
          }}
        />
        <CartBar
          fr={fr}
          accent="amber"
          glyph={<CartGlyph count={cartCount} />}
          goodsXaf={goodsEstimateXaf}
          goodsPartial={anyPriceUnknown}
          fare={fare}
          hint={
            cartCount === 0
              ? fr
                ? "Choisissez vos plats"
                : "Pick your dishes"
              : fr
                ? "Posez l'épingle de livraison pour voir le prix"
                : "Drop the delivery pin to see the fee"
          }
          cta={fr ? "Suivant" : "Next"}
          onCta={() => setStage("details")}
          disabled={cartCount === 0}
        />
      </div>
    );
  }

  /* ─── Where to, and who ─────────────────────────────────────────────────
     Reached once there is something to deliver. The cart stays on the bar so
     the thread is never lost, and the basket line is editable in one tap. */
  if (stage === "details") {
    return (
      <div className="mx-auto max-w-lg px-4 pb-32 pt-4">
        <header className="mb-4">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-amber-300">
            <UtensilsCrossed className="h-4 w-4" /> {fr ? "Manger ce soir" : "Food tonight"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-mist-100">
            {fr ? "On livre où ?" : "Where are we taking it?"}
          </h1>
        </header>

        {browsing && (
          <button
            type="button"
            onClick={() => setStage(openMerchant ? "menu" : "list")}
            className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-left"
          >
            <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-bold text-mist-100">
                {lines[0].merchantName}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-mist-400">
                {lines.map((l) => `${l.quantity}× ${l.name}`).join(" · ")}
              </span>
            </span>
            <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" />
          </button>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
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
        </section>

        {/*
          The note, promoted.

          On Meituan the checkout note is the most-used control in the whole
          flow — it is where "no chilli" and "call at the gate" live. Ours was a
          single-line afterthought at the bottom of a stack of fields. In a city
          navigated by landmarks rather than street numbers, this field is half
          the delivery, so it gets its own block and room to write in.
        */}
        <section className="mt-3 rounded-2xl border border-dashed border-ink-600 bg-ink-900/60 p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-mist-400">
            {fr ? "Une note pour le livreur" : "A note for the rider"}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={250}
              placeholder={
                fr
                  ? "Portail bleu, appeler en arrivant, pas de piment…"
                  : "Blue gate, call when you arrive, no chilli…"
              }
              className="mt-1.5 w-full resize-none rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-normal normal-case tracking-normal text-mist-100 placeholder:text-mist-500 focus:border-amber-400 focus:outline-none"
            />
          </label>
        </section>

        <section className="mt-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-mist-400">
            {fr ? "Paiement" : "Payment"}
          </p>
          <div className="mt-2 flex gap-2">
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

        <CartBar
          fr={fr}
          accent="amber"
          glyph={<CartGlyph count={cartCount} />}
          goodsXaf={goodsEstimateXaf}
          goodsPartial={anyPriceUnknown}
          fare={fare}
          missing={attempted ? missing : undefined}
          cta={fr ? "Continuer" : "Continue"}
          onCta={submitOrder}
          disabled={attempted && !ready}
        />
      </div>
    );
  }

  /* ─── The list ──────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-4">
      <header className="mb-4">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-amber-300">
          <UtensilsCrossed className="h-4 w-4" /> {fr ? "Manger ce soir" : "Food tonight"}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-mist-100">
          {fr ? "Qu'est-ce qu'on vous apporte ?" : "What are we bringing you?"}
        </h1>
      </header>

      {merchants === null ? (
        /* Shaped like what is coming rather than a spinner. On Cameroonian
           mobile data this is on screen for a couple of seconds, and a page
           that already has the right silhouette feels loaded before it is. */
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">{fr ? "Chargement…" : "Loading…"}</span>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-3 py-2.5"
            >
              <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-ink-800" />
              <div className="flex-1">
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-ink-800" />
                <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-ink-800/70" />
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

          {/*
            A way in by what you feel like eating, not by which restaurant you
            already know the name of — which is the question somebody actually
            arrives with at 1 AM.

            Held to the same rule as the open/closed chips above: offered only
            when there is more than one kind of food to choose between, because
            a filter with one option teaches people not to press filters.
          */}
          {dishCategories.length > 1 && (
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FilterChip active={dishCategory === null} onClick={() => setDishCategory(null)}>
                {fr ? "Tous les plats" : "All dishes"}
              </FilterChip>
              {dishCategories.map(([c, n]) => (
                <FilterChip key={c} active={dishCategory === c} onClick={() => setDishCategory(dishCategory === c ? null : c)}>
                  {c} <span className="tabular-nums opacity-60">{n}</span>
                </FilterChip>
              ))}
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
            <div className="flex flex-col gap-2">
              {shown.map((m) => (
                <MerchantRow
                  key={m.id}
                  merchant={m}
                  fr={fr}
                  inCart={m.items.reduce((n, i) => n + (cart[i.id] ?? 0), 0)}
                  onOpen={() => {
                    setOpenMerchantId(m.id);
                    setStage("menu");
                  }}
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
        <section
          id="food-free-text"
          className="mt-5 flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4"
        >
          <p className="text-sm font-semibold text-mist-100">
            {fr ? "Ou dites-nous simplement" : "Or just tell us"}
          </p>
          {/*
            The restaurant, searched rather than typed into a blank box.

            This was a bare `<input>`, and it was the oldest thing left on this
            screen: the customer typed "Mami Eru restaurant" and the rider left
            with a name, no pin, no phone number and no certainty the place
            exists under that spelling. The medicine page has had the picker for
            versions; food, the busiest service, did not.

            Three tiers now, in the order that says which we trust: restaurants
            we have called, then businesses found on the map, then the same free
            text as before, because our list will never cover every spot in
            Yaoundé and an order refused for that is a lost order.
          */}
          <MerchantField
            category="FOOD"
            accent={ACCENT}
            cardAccent="amber"
            fr={fr}
            label={fr ? "Le restaurant" : "The restaurant"}
            placeholder={fr ? "Ex. Chez Maman Josephine" : "e.g. Chez Maman Josephine"}
            value={vendorName}
            merchantId={pickedMerchantId}
            onPick={(m, loc) => {
              setPickedMerchantId(m.id);
              setPickedPlaceId(null);
              setVendorName(m.merchantName);
              setPickup(loc);
            }}
            onDiscovered={(b, loc) => {
              // Not a merchant of ours, so no id: the order goes out on the
              // free-text path with a real pin on it, which is exactly what it
              // is — go to this address and buy this.
              setPickedMerchantId(null);
              setPickedPlaceId(b.placeId);
              setVendorName(b.name);
              setPickup(loc);
            }}
            onFreeText={(name) => {
              setPickedMerchantId(null);
              setPickedPlaceId(null);
              setVendorName(name);
            }}
            error={attempted && usingFreeText && !vendorName.trim()}
          />
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

      <CartBar
        fr={fr}
        accent="amber"
        glyph={<CartGlyph count={cartCount} />}
        goodsXaf={goodsEstimateXaf}
        goodsPartial={anyPriceUnknown}
        fare={fare}
        hint={
          fr
            ? "Choisissez un restaurant, ou dites-nous où aller"
            : "Pick a restaurant, or tell us where to go"
        }
        cta={fr ? "Suivant" : "Next"}
        onCta={() => setStage("details")}
        disabled={!browsing && !usingFreeText}
      />
    </div>
  );
}

/** The basket, with what is in it. The thread, never lost. */
function CartGlyph({ count }: { count: number }) {
  return (
    <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10">
      <ShoppingBag className="h-5 w-5 text-amber-300" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 font-display text-xs font-bold tabular-nums text-ink-950">
          {count}
        </span>
      )}
    </span>
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
      /* `shrink-0` and `whitespace-nowrap` because the dish-category row
         scrolls horizontally; without them the chips squeeze into each other
         rather than running off the edge. */
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-200"
          : "border-ink-700 text-mist-400 hover:text-mist-200"
      }`}
    >
      {children}
    </button>
  );
}
