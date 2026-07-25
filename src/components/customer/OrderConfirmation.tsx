"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MessageCircle, RefreshCw, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildOrderMessage } from "@/lib/whatsapp/buildOrderMessage";
import { buildWaLink, MAIN_WHATSAPP_NUMBER, ADMIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { CUSTOMER_STATUS_KEY, CUSTOMER_TIMELINE } from "@/lib/orders/statusLabels";
import { getLegalNotice } from "@/lib/i18n/legal";
import { Stepper } from "@/components/customer/order/Stepper";
import { DownloadPdfButton } from "@/components/customer/order/DownloadPdfButton";
import type { OrderPdfData } from "@/components/customer/order/orderPdf";
import { Button, LinkButton } from "@/components/shared/Button";
import { PaymentCard, type PaymentInfo } from "@/components/customer/PaymentCard";
import { VerifyOrderCard } from "@/components/customer/VerifyOrderCard";
import { QuoteCard } from "@/components/customer/QuoteCard";
import { OrderCaseThread } from "@/components/customer/OrderCaseThread";
import { SaveAccountPrompt } from "@/components/customer/account/SaveAccountPrompt";

const LiveTrackMap = dynamic(() => import("@/components/customer/LiveTrackMap").then((m) => m.LiveTrackMap), { ssr: false });
import { cn } from "@/lib/utils";
import type { OrderStatus, PaymentMethod, PreferredLanguage, PrescriptionRequired, ServiceType } from "@prisma/client";

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
  const router = useRouter();

  const statusKey = CUSTOMER_STATUS_KEY[order.orderStatus];
  const isCancelled = statusKey === "cancelled";
  const currentIdx = CUSTOMER_TIMELINE.indexOf(statusKey);
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
        {isCancelled ? (
          <p className="text-sm font-medium text-restricted">{t("customerStatus.cancelled")}</p>
        ) : (
          <ol className="flex flex-col gap-0">
            {CUSTOMER_TIMELINE.map((step, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx;
              return (
                <li key={step} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
                        done && "border-safe bg-safe/20 text-safe",
                        current && "border-gold-400 bg-gold-400/15 text-gold-400",
                        !done && !current && "border-ink-700 text-mist-500"
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    {i < CUSTOMER_TIMELINE.length - 1 && (
                      <span className={cn("h-5 w-px", done ? "bg-safe/50" : "bg-ink-700")} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "pt-0.5 text-sm",
                      current ? "font-semibold text-gold-300" : done ? "text-mist-300" : "text-mist-500"
                    )}
                  >
                    {t(`customerStatus.${step}`)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {order.customerVisibleNotes && (
          <p className="mt-3 rounded-xl bg-ink-800 p-3 text-xs text-mist-300">{order.customerVisibleNotes}</p>
        )}
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4" /> {t("confirmation.refresh")}
        </Button>
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
