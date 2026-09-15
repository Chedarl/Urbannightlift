"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, BadgeCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getDisclaimer, getLegalNotice } from "@/lib/i18n/legal";
import { loadDraft, saveDraft, clearDraft, type OrderDraft } from "@/lib/orders/draft";
import { priceCopy } from "@/lib/orders/priceCopy";
import { isShoppingService, orderMoney } from "@/lib/orders/goodsMoney";
import { MoneyBreakdown } from "@/components/customer/order/MoneyBreakdown";
import { DownloadPdfButton } from "@/components/customer/order/DownloadPdfButton";
import type { OrderPdfData } from "@/components/customer/order/orderPdf";
import { Button, LinkButton } from "@/components/shared/Button";
import { CheckoutBar } from "@/components/customer/order/CheckoutBar";
import { PaymentSelector } from "@/components/customer/order/PaymentSelector";
import { TipChooser } from "@/components/customer/order/TipChooser";
import { clampTip } from "@/lib/orders/tip";
import { usePaymentMethods } from "@/lib/payments/usePaymentMethods";
import type { PaymentMethod } from "@/lib/payments/methods";
import { applyLaunchOffer } from "@/lib/orders/launchOffer";
import { formatXaf } from "@/lib/utils";

/** Flatten structured serviceDetails into readable label/value rows for review. */
function structuredRows(draft: OrderDraft, fr: boolean): [string, string][] {
  const sd = (draft.serviceDetails ?? {}) as Record<string, unknown>;
  const rows: [string, string][] = [];
  const list = (arr: unknown, fmt: (o: Record<string, unknown>) => string) =>
    Array.isArray(arr) ? arr.filter(Boolean).map((o) => fmt(o as Record<string, unknown>)).filter(Boolean).join(" · ") : "";
  // The forms and these readers were written with different key names, so accept
  // both spellings — this also repairs orders already stored with the old keys.
  const foods = list(sd.foodItems ?? sd.items, (o) => (o.name ? `${o.qty || 1}× ${o.name}` : ""));
  if (foods) rows.push([fr ? "Plats" : "Dishes", foods]);
  const meds = list(sd.meds, (o) => (o.name ? `${o.qty || 1}× ${o.name}${o.dosage ? ` (${o.dosage})` : ""}` : ""));
  if (meds) rows.push([fr ? "Médicaments" : "Medicines", meds]);
  const grocery = list(sd.groceryItems, (o) => (o.name ? `${o.qty || 1}× ${o.name}` : ""));
  if (grocery) rows.push([fr ? "Articles" : "Items", grocery]);
  const place = sd.place ?? sd.vendorName;
  if (place) rows.push([fr ? "Lieu" : "Place", String(place)]);
  if (sd.pharmacy) rows.push([fr ? "Pharmacie" : "Pharmacy", String(sd.pharmacy)]);
  const store = sd.store ?? sd.storeName;
  if (store) rows.push([fr ? "Magasin" : "Store", String(store)]);
  if (sd.title) rows.push([fr ? "Demande" : "Request", String(sd.title)]);
  if (sd.category) rows.push([fr ? "Catégorie" : "Category", String(sd.category)]);
  if (sd.size) rows.push([fr ? "Taille" : "Size", String(sd.size)]);
  if (sd.weight) rows.push([fr ? "Poids" : "Weight", String(sd.weight)]);
  const receiver = sd.recipientName ?? sd.receiverName;
  if (receiver) rows.push([fr ? "Destinataire" : "Receiver", String(receiver)]);
  const receiverPhone = sd.recipientPhone ?? sd.receiverPhone;
  if (receiverPhone) rows.push([fr ? "Tél. destinataire" : "Receiver phone", String(receiverPhone)]);
  if (sd.budgetXaf) rows.push([fr ? "Budget" : "Budget", `${sd.budgetXaf} XAF`]);
  if (sd.deadline) rows.push([fr ? "Échéance" : "Deadline", String(sd.deadline)]);
  if (sd.accessNotes) rows.push([fr ? "Accès" : "Access notes", String(sd.accessNotes)]);
  if (sd.counterRef) rows.push([fr ? "Réf." : "Ref", String(sd.counterRef)]);
  return rows;
}

/**
 * The things the customer asked us to buy, however their service recorded them.
 * Used only for the money block's itemised lines — an unrecognised shape yields
 * nothing rather than a guess.
 */
function goodsItems(draft: OrderDraft): { name: string; qty?: number }[] {
  const sd = (draft.serviceDetails ?? {}) as Record<string, unknown>;
  const out: { name: string; qty?: number }[] = [];
  for (const key of ["foodItems", "items", "groceryItems", "meds"]) {
    const list = sd[key];
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      const qty = Number(r.qty);
      out.push({ name, qty: Number.isFinite(qty) && qty > 0 ? qty : undefined });
    }
  }
  return out;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-mist-500">{label}</span>
      <span className="text-right text-sm font-medium text-mist-100">{value}</span>
    </div>
  );
}

export interface OrderReviewProps {
  signedIn: boolean;
  /** Whether placing an order needs an account at all. The owner's switch. */
  accountRequired: boolean;
  /** The launch-offer cap, or 0 when this person is not eligible. */
  firstOrderFreeCapXaf: number;
}

export function OrderReview({ signedIn, accountRequired, firstOrderFreeCapXaf }: OrderReviewProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  // Above the early returns, because hooks are not allowed to be conditional
  // and this screen returns early for an expired draft.
  const payMethods = usePaymentMethods();

  useEffect(() => {
    setDraft(loadDraft());
    setLoaded(true);
  }, []);

  /*
    A draft can outlive the configuration it was made under.

    Somebody who chose Orange Money in a tab left open, or before the merchant
    code was removed, arrives here holding a method the server will now refuse.
    Correcting it silently would change what they chose without telling them, so
    the selector below shows the new choice and they can see it; what is not
    acceptable is letting them reach the slider on a method that cannot be paid.
    Cash leads `payMethods`, so there is always somewhere to land.
  */
  useEffect(() => {
    if (!draft || payMethods.length === 0) return;
    if (payMethods.includes(draft.paymentMethod as PaymentMethod)) return;
    const next = { ...draft, paymentMethod: payMethods[0] };
    setDraft(next);
    saveDraft(next);
  }, [draft, payMethods]);

  if (!loaded) return null;
  if (!draft) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-12 text-center">
        <p className="text-sm text-mist-300">{t("review.expired")}</p>
        <Button className="mt-4" onClick={() => router.push("/order/new")}>
          {t("review.editOrder")}
        </Button>
      </div>
    );
  }

  const fr = draft.preferredLanguage === "FR";
  // A firm price is the zone tariff and is final. The server re-decides this
  // authoritatively when the order is created, so this only chooses wording.
  const firm = draft.priceFirm === true && draft.estimatedFeeXaf != null;
  const shopping = isShoppingService(draft.serviceType);
  const copy = priceCopy(firm, fr, shopping);
  // The money, split the way the customer needs to see it: what they asked us
  // to buy, our fee, and the sum — never one blended number.
  const tip = clampTip(draft.tipXaf ?? 0);
  const money = orderMoney({
    serviceType: draft.serviceType,
    deliveryFeeXaf: draft.estimatedFeeXaf,
    goodsCapXaf: draft.goodsCapXaf ?? null,
    goodsActualXaf: null,
    overCapApprovedXaf: null,
    tipXaf: tip,
  });
  const goodsAtDoor = shopping && draft.paymentMethod !== "CASH";

  /*
    The first delivery, free — shown here, decided on the server.

    `applyLaunchOffer` is the same function `POST /api/orders` waives with, so
    the figure on the bar is the figure that will be charged. The eligibility
    is not the browser's to judge: the page was told whether this person
    qualifies, and a cap of zero means no.
  */
  const offer = applyLaunchOffer({
    feeXaf: money.deliveryFeeXaf,
    completedOrders: firstOrderFreeCapXaf > 0 ? 0 : 1,
    capXaf: firstOrderFreeCapXaf,
  });

  /*
    Whether "Place order" places an order, or asks for an account first.

    This is the gate, moved from the top of the screen to the one control it
    belongs on. Everything above it renders either way: the summary, the
    address, and above all the price.
  */
  const gated = accountRequired && !signedIn;
  const paymentLabel = draft.paymentMethod === "MTN_MOMO" ? "MTN MoMo" : draft.paymentMethod === "ORANGE_MONEY" ? "Orange Money" : fr ? "Paiement à la livraison" : "Cash on delivery";
  const rows = structuredRows(draft, fr);
  const pdfData: OrderPdfData = {
    orderCode: "PENDING",
    createdAt: new Date(),
    locale: fr ? "fr" : "en",
    customerName: draft.fullName,
    customerWhatsapp: draft.whatsappNumber,
    serviceLabel: t(`services.${draft.serviceType}.name`),
    itemDescription: draft.itemDescription,
    serviceDetails: (draft.serviceDetails ?? null) as Record<string, unknown> | null,
    quantity: draft.quantity,
    declaredValueXaf: draft.declaredValueXaf,
    pickupLocation: draft.pickupLocation,
    pickupZoneName: draft.pickupZoneName,
    deliveryLocation: draft.deliveryLocation,
    deliveryZoneName: draft.deliveryZoneName,
    estimatedFeeXaf: draft.estimatedFeeXaf,
    paymentMethodLabel: paymentLabel,
    legalNotice: getLegalNotice(fr ? "fr" : "en"),
  };

  async function submit() {
    if (!draft) return;
    /*
      The draft is already in storage, so sign-up costs a screen and no lost
      work — they come back to this exact summary with `next`.
    */
    if (gated) {
      router.push(`/account/signup?next=${encodeURIComponent("/order/review")}`);
      return;
    }
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      // Account-first: if the session lapsed between filling this in and
      // submitting, send them to sign in and back, not to a dead error.
      if (res.status === 401) {
        router.push(`/account/login?next=${encodeURIComponent("/order/review")}`);
        return;
      }
      if (!res.ok) throw new Error("submit failed");
      const { orderCode } = await res.json();
      clearDraft();
      router.push(`/order/confirmation/${orderCode}`);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    /* `pb-52` rather than `pb-32`: `CheckoutBar` grew a second row when the
       submit became a slider, and at `pb-32` it sat on top of the PDF button
       and the legal notice. The clearance is measured against the bar's real
       height, not guessed — a pinned bar that covers the last two controls on
       the page is the defect the pinned bar was introduced to fix. */
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-52">
      {/*
        The stepper is gone from the whole journey.

        It rendered at step 1 on two of seven services and step 2 here, and
        never at step 3 because no screen showed it — so a parcel customer saw
        nothing, then a "2 of 3" appearing from nowhere, then nothing again.
        The pinned bars carry the context instead: what this costs and what
        happens when you press the button, on the screen you are on.
      */}
      <div>
        <h1 className="font-display text-2xl font-bold">{t("review.title")}</h1>
        <p className="mt-1 text-sm text-mist-500">{t("review.subtitle")}</p>
      </div>

      {/* What happens when they tap through. A firm zone-tariff price is final
          and goes straight to payment, so saying "pending confirmation" would
          be teaching them to distrust a number that cannot move. A price that
          genuinely needs a person says so, with how long it takes. */}
      {firm ? (
        <div className="flex items-start gap-3 rounded-2xl border border-safe/40 bg-safe/[0.08] p-4">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-safe" />
          <div>
            <p className="text-sm font-semibold text-mist-100">
              {/* On a shopping order only the delivery is confirmed, so the
                  heading must not claim the whole price is settled. */}
              {isShoppingService(draft.serviceType)
                ? fr ? "Livraison confirmée" : "Delivery confirmed"
                : fr ? "Prix confirmé" : "Price confirmed"}
              {draft.estimatedFeeXaf != null ? ` · ${formatXaf(draft.estimatedFeeXaf)}` : ""}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-mist-300">{copy.note}</p>
          </div>
        </div>
      ) : (
        /*
          A caution, and it now looks like one.

          This said "the price may still change" in gold — the colour reserved
          for money — six lines above the total the customer is about to agree
          to. The two were indistinguishable at a glance, which is the exact
          collision `globals.css` changed `--color-caution` away from
          `--color-gold-400` to end. Colour alone was never enough either, so
          it carries the shape as well: the left border and the icon.
        */
        <div className="flex items-start gap-3 rounded-2xl border border-caution/40 border-l-[3px] border-l-caution bg-caution/[0.08] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-caution" />
          <div>
            <p className="text-sm font-semibold text-mist-100">{t("review.pendingBadge")}</p>
            <p className="mt-1 text-xs leading-relaxed text-mist-300">{copy.note}</p>
          </div>
        </div>
      )}

      <div className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900 px-4 py-2">
        <Row label={t("review.customer")} value={`${draft.fullName} • ${draft.whatsappNumber}`} />
        <Row label={t("review.service")} value={t(`services.${draft.serviceType}.name`)} />
        <Row
          label={t("review.pickup")}
          value={
            <>
              {draft.pickupLocation}
              {draft.pickupLandmark ? <span className="block text-xs text-mist-500">{draft.pickupLandmark}</span> : null}
              {draft.pickupZoneName ? <span className="block text-xs text-violet-300">{draft.pickupZoneName}</span> : null}
            </>
          }
        />
        <Row
          label={t("review.delivery")}
          value={
            <>
              {draft.deliveryLocation}
              {draft.deliveryLandmark ? <span className="block text-xs text-mist-500">{draft.deliveryLandmark}</span> : null}
              {draft.deliveryZoneName ? <span className="block text-xs text-violet-300">{draft.deliveryZoneName}</span> : null}
            </>
          }
        />
        <Row label={t("review.item")} value={`${draft.itemDescription} × ${draft.quantity}`} />
        {rows.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
        <Row label={t("review.declaredValue")} value={formatXaf(draft.declaredValueXaf)} />
        {/* On a shopping order the money needs its own itemised block below, so
            the fee is not repeated here as if it were the whole price. */}
        {!shopping && (
          <Row
            label={copy.label}
            value={draft.estimatedFeeXaf != null ? formatXaf(draft.estimatedFeeXaf) : "—"}
          />
        )}
        {/* Payment used to be a read-only row here — the customer was shown
            what they picked before they knew the price, and could not change
            it without going back through the whole form. It is now a live
            control of its own, below. */}
        <Row
          label={t("review.disclaimerConfirmed")}
          value={<CheckCircle2 className="ml-auto h-5 w-5 text-safe" />}
        />
      </div>

      {/* The arithmetic, shown rather than asserted. Goods, fee, total — never
          blended into one number, because a blended number is exactly what
          somebody skimming would show you. */}
      {/*
        The method, chosen where the amount is.

        Writing straight back to the draft means the order submitted is the one
        on screen — there is no second copy of this decision to fall out of step
        with. The server still validates it: a method with no merchant code is
        rejected there too, so a tampered draft cannot conjure one.
      */}
      <PaymentSelector
        fr={fr}
        methods={payMethods}
        value={draft.paymentMethod as PaymentMethod}
        shopping={shopping}
        onChange={(m) => {
          const next = { ...draft, paymentMethod: m };
          setDraft(next);
          saveDraft(next);
        }}
      />

      {/*
        Offered after the payment method, because the sentence about where the
        money goes depends on it — "added to your payment" and "hand it over at
        the door" are different facts and the customer has just chosen which.
      */}
      <TipChooser
        fr={fr}
        valueXaf={tip}
        cash={draft.paymentMethod === "CASH"}
        onChange={(xaf) => {
          const next = { ...draft, tipXaf: xaf };
          setDraft(next);
          saveDraft(next);
        }}
      />

      <MoneyBreakdown
        money={money}
        items={goodsItems(draft)}
        capXaf={draft.goodsCapXaf ?? null}
        goodsAtDoor={goodsAtDoor}
        fareLines={draft.fareLines ?? []}
        fareEstimated={draft.fareEstimated === true}
        waivedXaf={offer.waivedXaf}
        fr={fr}
      />

      <DownloadPdfButton data={pdfData} label={t("review.downloadPdf")} className="w-full" />

      {/* Small print, set as small print. It was gold on gold, which made a
          legal paragraph compete with the total for the same meaning. */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4 text-xs leading-relaxed text-mist-400">
        {getDisclaimer(locale)}
      </div>

      {error && <p className="text-sm text-restricted">{t("common.error")}</p>}

      {/*
        What an account buys, said here rather than as a wall.

        The old gate stood in front of this screen and made these three
        promises to somebody who had not yet seen a price. Said at the moment
        of placing the order they are not a toll — they are a description of
        what is about to happen to this order.
      */}
      {gated && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-200">
            <BadgeCheck className="h-4 w-4 shrink-0" />
            {fr ? "Un compte, et cette commande est à vous" : "One account, and this order is yours"}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs leading-relaxed text-mist-300">
            <li>{fr ? "Le suivi en direct de ce livreur" : "Live tracking of this rider"}</li>
            <li>{fr ? "Ce reçu, gardé pour vous" : "This receipt, kept for you"}</li>
            <li>{fr ? "Un lien pour vous faire suivre par un proche" : "A link to let someone watch you home"}</li>
          </ul>
        </div>
      )}

      <LinkButton href="/order/new" variant="outline" size="lg">
        {t("review.editOrder")}
      </LinkButton>

      <CheckoutBar
        fr={fr}
        money={money}
        waivedXaf={offer.waivedXaf}
        priceFirm={firm}
        submitting={submitting}
        onSubmit={() => submit()}
        gated={gated}
        cta={submitting ? t("review.submitting") : t("review.submitOrder")}
      />
    </div>
  );
}
