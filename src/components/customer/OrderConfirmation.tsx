"use client";

import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildOrderMessage } from "@/lib/whatsapp/buildOrderMessage";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";
import { getLegalNotice } from "@/lib/i18n/legal";
import { Stepper } from "@/components/customer/order/Stepper";
import { DownloadPdfButton } from "@/components/customer/order/DownloadPdfButton";
import { DownloadReceiptButton } from "@/components/customer/order/DownloadReceiptButton";
import type { ReceiptPdfData } from "@/components/customer/order/receiptPdf";
import type { OrderPdfData } from "@/components/customer/order/orderPdf";
import { LinkButton } from "@/components/shared/Button";
import { PaymentCard, type PaymentInfo } from "@/components/customer/PaymentCard";
import { VerifyOrderCard } from "@/components/customer/VerifyOrderCard";
import { QuoteCard } from "@/components/customer/QuoteCard";
import { OrderCaseThread } from "@/components/customer/OrderCaseThread";
import { LiveTimeline } from "@/components/customer/LiveTimeline";
import { ConfirmReceipt } from "@/components/customer/ConfirmReceipt";
import { SaveAccountPrompt } from "@/components/customer/account/SaveAccountPrompt";

const LiveTrackMap = dynamic(() => import("@/components/customer/LiveTrackMap").then((m) => m.LiveTrackMap), { ssr: false });
import { cn } from "@/lib/utils";
import type { OrderStatus, PaymentMethod, PreferredLanguage, PrescriptionRequired, ServiceType } from "@prisma/client";
import type { CustomerStatusKey } from "@/lib/orders/statusLabels";

/** Confirming before the rider is on the way with the goods means nothing. */
const CAN_CONFIRM: OrderStatus[] = [
  "RIDER_GOING_TO_DELIVERY",
  "RIDER_ARRIVED_AT_DELIVERY",
  "DELIVERY_PROOF_SUBMITTED",
  "DELIVERED",
];

export interface ConfirmationOrder {
  orderCode: string;
  createdAt: string;
  orderStatus: OrderStatus;
  /** True once the visitor proved they own this order (placed it, or passed the code + phone check). */
  verified: boolean;
  customerName: string;
  customerWhatsapp: string;
  preferredLanguage: PreferredLanguage;
  serviceType: ServiceType;
  itemDescription: string;
  serviceDetails: Record<string, unknown> | null;
  estimatedFeeXaf: number | null;
  pickupZoneName: string | null;
  deliveryZoneName: string | null;
  quantity: number;
  declaredValueXaf: number;
  isFragile: boolean;
  isMedicine: boolean;
  prescriptionRequired: PrescriptionRequired | null;
  pickupLocation: string;
  pickupLandmark: string | null;
  deliveryLocation: string;
  deliveryLandmark: string | null;
  paymentMethod: PaymentMethod;
  specialInstructions: string | null;
  customerVisibleNotes: string | null;
  otpCode: string | null;
  /** The priced quote awaiting the customer's agreement. */
  quoteSentAt: string | null;
  quoteAcceptedAt: string | null;
  quoteDeclinedAt: string | null;
  quotedFeeXaf: number | null;
  /** The customer's own proof that the goods arrived. */
  customerConfirmedAt: string | null;
  customerConfirmMethod: string | null;
  /** Pre-rendered so the timeline is correct before the first poll lands. */
  steps: { key: CustomerStatusKey; done: boolean; current: boolean; at: string | null }[];
  deliveredAt: string | null;
  riderName: string | null;
  amountPaidXaf: number | null;
  paymentReference: string | null;
  paymentVerifiedAt: string | null;
}

export function OrderConfirmation({
  order,
  payment,
  offerAccount = false,
}: {
  order: ConfirmationOrder;
  payment: PaymentInfo;
  /** Guest (not signed in) who just ordered — offer to claim an account. */
  offerAccount?: boolean;
}) {
  const { t } = useTranslation();

  const statusKey = CUSTOMER_STATUS_KEY[order.orderStatus];
  const isCancelled = statusKey === "cancelled";
  const verified = order.verified;
  // Payment submission and the shareable summary both expose private details,
  // so they stay behind the ownership check.
  const showPayment = verified && !isCancelled && payment.paymentStatus !== "VERIFIED";

  const waMessage = buildOrderMessage({
    orderCode: order.orderCode,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    language: order.preferredLanguage === "FR" ? "fr" : "en",
    serviceTypeLabel: t(`services.${order.serviceType}.name`),
    itemDescription: order.itemDescription,
    quantity: order.quantity,
    declaredValueXaf: order.declaredValueXaf,
    isFragile: order.isFragile,
    isMedicine: order.isMedicine,
    prescriptionRequired: order.prescriptionRequired,
    pickupLocation: order.pickupLocation,
    pickupLandmark: order.pickupLandmark,
    deliveryLocation: order.deliveryLocation,
    deliveryLandmark: order.deliveryLandmark,
    paymentMethodLabel: order.paymentMethod === "MTN_MOMO" ? "MTN MOMO" : order.paymentMethod === "ORANGE_MONEY" ? "ORANGE MONEY" : "CASH ON DELIVERY",
  });

  const fr = order.preferredLanguage === "FR";
  const pdfData: OrderPdfData = {
    orderCode: order.orderCode,
    createdAt: new Date(order.createdAt),
    locale: fr ? "fr" : "en",
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    serviceLabel: t(`services.${order.serviceType}.name`),
    itemDescription: order.itemDescription,
    serviceDetails: order.serviceDetails,
    quantity: order.quantity,
    declaredValueXaf: order.declaredValueXaf,
    pickupLocation: order.pickupLocation,
    pickupZoneName: order.pickupZoneName ?? undefined,
    deliveryLocation: order.deliveryLocation,
    deliveryZoneName: order.deliveryZoneName ?? undefined,
    estimatedFeeXaf: order.estimatedFeeXaf,
    paymentMethodLabel: order.paymentMethod === "MTN_MOMO" ? "MTN MoMo" : order.paymentMethod === "ORANGE_MONEY" ? "Orange Money" : fr ? "Paiement à la livraison" : "Cash on delivery",
    legalNotice: getLegalNotice(fr ? "fr" : "en"),
  };

  // The receipt is only meaningful once the customer has said they received
  // the goods, so it appears at exactly that moment and not before.
  const receiptData: ReceiptPdfData = {
    orderCode: order.orderCode,
    locale: fr ? "fr" : "en",
    issuedAt: new Date(),
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    serviceLabel: t(`services.${order.serviceType}.name`),
    itemDescription: order.itemDescription,
    pickupLocation: order.pickupLocation,
    deliveryLocation: order.deliveryLocation,
    amountPaidXaf: order.amountPaidXaf,
    paymentMethodLabel: pdfData.paymentMethodLabel,
    paymentReference: order.paymentReference,
    paymentVerified: payment.paymentStatus === "VERIFIED",
    paymentVerifiedAt: order.paymentVerifiedAt ? new Date(order.paymentVerifiedAt) : null,
    deliveredAt: order.deliveredAt ? new Date(order.deliveredAt) : null,
    confirmMethod: order.customerConfirmMethod,
    confirmedAt: order.customerConfirmedAt ? new Date(order.customerConfirmedAt) : null,
    riderName: order.riderName,
    legalNotice: getLegalNotice(fr ? "fr" : "en"),
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-16">
      {!isCancelled && <Stepper current={3} />}
      <div>
        <h1 className="font-display text-2xl font-bold">{t("confirmation.title")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">{t("confirmation.message")}</p>
      </div>

      <div className="rounded-2xl border border-gold-400/40 bg-ink-900 p-4 text-center">
        <p className="text-xs uppercase tracking-wider text-mist-500">{t("confirmation.orderId")}</p>
        <p className="mt-1 font-display text-3xl font-bold tracking-widest text-gold-400">
          {order.orderCode}
        </p>
        <p className="mt-1 text-xs text-mist-500">{t("confirmation.keepCode")}</p>
        {verified && (
          <DownloadPdfButton data={pdfData} label={t("confirmation.downloadPdf")} className="mx-auto mt-3" />
        )}
      </div>

      {!verified && (
        <VerifyOrderCard orderCode={order.orderCode} maskedPhone={order.customerWhatsapp} />
      )}

      {/* The quote. Sits above everything else because until the customer
          answers it, nothing on this order can move. */}
      {verified && order.quoteSentAt && order.quotedFeeXaf != null && !isCancelled && (
        <QuoteCard
          orderCode={order.orderCode}
          feeXaf={order.quotedFeeXaf}
          note={order.customerVisibleNotes}
          accepted={order.quoteAcceptedAt != null}
          declined={order.quoteDeclinedAt != null}
          fr={fr}
        />
      )}

      {order.otpCode && !isCancelled && (
        <div className="rounded-2xl border border-violet-500/40 bg-violet-950/40 p-4 text-center">
          <p className="text-xs uppercase tracking-wider text-violet-300">{t("confirmation.otpTitle")}</p>
          <p className="mt-1 font-display text-2xl font-bold tracking-[0.5em] text-mist-100">
            {order.otpCode}
          </p>
          <p className="mt-1 text-xs text-mist-500">{t("confirmation.otpHint")}</p>
        </div>
      )}

      {/* Pay for delivery (merchant code) */}
      {showPayment && <PaymentCard info={payment} />}

      {/* Proof of payment and delivery, issued only once the goods are
          confirmed received. */}
      {verified && order.customerConfirmedAt && (
        <DownloadReceiptButton
          data={receiptData}
          label={fr ? "Télécharger le reçu" : "Download your receipt"}
        />
      )}

      {/* The customer's own proof of receipt — the other half of the rider's
          delivery proof, and what closes the order honestly. */}
      {verified && !isCancelled && (
        <ConfirmReceipt
          orderCode={order.orderCode}
          confirmedAt={order.customerConfirmedAt}
          confirmMethod={order.customerConfirmMethod}
          canConfirm={CAN_CONFIRM.includes(order.orderStatus)}
          fr={fr}
        />
      )}

      {/* A complaint belongs on the order it is about — no code to type, no
          context to re-explain, and our reply comes back here. */}
      {verified && <OrderCaseThread orderCode={order.orderCode} fr={fr} />}

      {verified && offerAccount && (
        <SaveAccountPrompt fullName={order.customerName} whatsappNumber={order.customerWhatsapp} />
      )}

      {/* Live tracking map (renders once locations/rider are known) */}
      {!isCancelled && <LiveTrackMap orderCode={order.orderCode} />}

      {/* Status timeline */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="mb-3 font-display text-base font-semibold">{t("confirmation.statusTitle")}</h2>
        <LiveTimeline
          orderCode={order.orderCode}
          initialSteps={order.steps}
          cancelled={isCancelled}
          confirmedAt={order.customerConfirmedAt}
          fr={fr}
        />
        {order.customerVisibleNotes && (
          <p className="mt-3 rounded-xl bg-ink-800 p-3 text-xs text-mist-300">{order.customerVisibleNotes}</p>
        )}
      </div>

      {/* WhatsApp hand-off — the message contains the full order, so it needs ownership */}
      <div className={cn("flex flex-col gap-3", !verified && "hidden")}>
        <p className="text-xs text-mist-500">{t("confirmation.whatsappHint")}</p>
        <LinkButton
          href={buildWaLink(MAIN_WHATSAPP_NUMBER, waMessage)}
          target="_blank"
          rel="noopener noreferrer"
          variant="whatsapp"
          size="lg"
        >
          <MessageCircle className="h-5 w-5" /> {t("confirmation.sendWhatsApp")}
        </LinkButton>
        <LinkButton
          href={buildWaLink(
            MAIN_WHATSAPP_NUMBER,
            `Order ${order.orderCode} — ${order.customerName}`
          )}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="md"
        >
          {t("confirmation.contactWhatsApp")}
        </LinkButton>
      </div>
    </div>
  );
}
