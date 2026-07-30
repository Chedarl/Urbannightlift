"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, BadgeCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getDisclaimer, getLegalNotice } from "@/lib/i18n/legal";
import { loadDraft, clearDraft, type OrderDraft } from "@/lib/orders/draft";
import { priceCopy } from "@/lib/orders/priceCopy";
import { isShoppingService } from "@/lib/orders/goodsMoney";
import { Stepper } from "@/components/customer/order/Stepper";
import { DownloadPdfButton } from "@/components/customer/order/DownloadPdfButton";
import type { OrderPdfData } from "@/components/customer/order/orderPdf";
import { Button, LinkButton } from "@/components/shared/Button";
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-mist-500">{label}</span>
      <span className="text-right text-sm font-medium text-mist-100">{value}</span>
    </div>
  );
}

export function OrderReview() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDraft(loadDraft());
    setLoaded(true);
  }, []);

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
  const copy = priceCopy(firm, fr, isShoppingService(draft.serviceType));
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
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-16">
      <Stepper current={2} />
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
        <div className="flex items-start gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
          <div>
            <p className="text-sm font-semibold text-gold-200">{t("review.pendingBadge")}</p>
            <p className="mt-1 text-xs leading-relaxed text-gold-200/80">{copy.note}</p>
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
        <Row
          label={copy.label}
          value={draft.estimatedFeeXaf != null ? formatXaf(draft.estimatedFeeXaf) : "—"}
        />
        <Row
          label={t("review.paymentMethod")}
          value={draft.paymentMethod === "MTN_MOMO" ? t("orderForm.mtnMomo") : draft.paymentMethod === "ORANGE_MONEY" ? t("orderForm.orangeMoney") : t("orderForm.cashOnDelivery")}
        />
        <Row
          label={t("review.disclaimerConfirmed")}
          value={<CheckCircle2 className="ml-auto h-5 w-5 text-safe" />}
        />
      </div>

      <DownloadPdfButton data={pdfData} label={t("review.downloadPdf")} className="w-full" />

      <div className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4 text-xs leading-relaxed text-gold-200">
        {getDisclaimer(locale)}
      </div>

      {error && <p className="text-sm text-restricted">{t("common.error")}</p>}

      <div className="flex flex-col gap-3">
        <Button size="lg" onClick={() => submit()} disabled={submitting}>
          {submitting ? t("review.submitting") : t("review.submitOrder")}
        </Button>
        <LinkButton href="/order/new" variant="outline" size="lg">
          {t("review.editOrder")}
        </LinkButton>
      </div>
    </div>
  );
}
