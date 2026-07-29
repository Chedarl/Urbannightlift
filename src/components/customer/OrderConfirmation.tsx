"use client";

import dynamic from "next/dynamic";
import { MessageCircle, ChevronDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildOrderMessage } from "@/lib/whatsapp/buildOrderMessage";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";
import { getLegalNotice } from "@/lib/i18n/legal";
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
import { OrderAlerts } from "@/components/customer/OrderAlerts";
import { SaveAccountPrompt } from "@/components/customer/account/SaveAccountPrompt";
import { OrderAgain } from "@/components/customer/order/OrderAgain";
import { RiderIdentityCard } from "@/components/customer/RiderIdentityCard";
import { ShareDelivery } from "@/components/customer/ShareDelivery";
import { JourneyStage } from "@/components/customer/journey/JourneyStage";
import { JourneyProgress } from "@/components/customer/journey/JourneyProgress";
import { Farewell } from "@/components/customer/journey/Farewell";
import { buildJourney, journeyComplete, stageOpen } from "@/lib/orders/customerJourney";

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
  /** How many nights they have had with us — used only to thank them properly at the end. */
  totalOrders: number;
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
  /** Only sent to a verified owner — where someone lives is not public. */
  deliveryLat: number | null;
  deliveryLng: number | null;
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

/**
 * The customer's order, as one thing happening rather than everything at once.
 *
 * This screen used to render every card it might ever need, permanently: the
 * quote, the payment box, the delivery code, both receipts, the confirm-receipt
 * form, the reorder prompt and the timeline, all stacked from the first second.
 * A customer who had already paid still had the payment card in front of them;
 * a customer waiting on a price already had "confirm you received it" below the
 * fold. Nothing said which of those was theirs to do now, and nothing looked
 * finished when it was finished.
 *
 * Now the order walks through five stages and only one of them is ever open.
 * Stages behind it collapse to a line of what happened and when; stages ahead
 * are named and shut. When it is all done the screen becomes a proper goodbye
 * instead of a form that went quiet.
 */
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
  const fr = order.preferredLanguage === "FR";

  const stages = buildJourney(
    {
      orderStatus: order.orderStatus,
      paymentStatus: payment.paymentStatus,
      paymentMethod: order.paymentMethod,
      quoteSentAt: order.quoteSentAt,
      quoteAcceptedAt: order.quoteAcceptedAt,
      quoteDeclinedAt: order.quoteDeclinedAt,
      quotedFeeXaf: order.quotedFeeXaf,
      riderName: order.riderName,
      otpIssued: order.otpCode != null,
      customerConfirmedAt: order.customerConfirmedAt,
      deliveredAt: order.deliveredAt,
    },
    fr
  );

  const finished = journeyComplete(stages) && !isCancelled;
  const done = stages.filter((s) => s.state === "DONE");
  const ahead = stages.filter((s) => s.state === "LOCKED" || s.state === "STOPPED");
  // Ownership gates every stage's controls: an order code travels through
  // screenshots, and none of this belongs to whoever happens to be holding one.
  const open = (key: Parameters<typeof stageOpen>[1]) => verified && !isCancelled && stageOpen(stages, key);

  const waMessage = buildOrderMessage({
    orderCode: order.orderCode,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    language: fr ? "fr" : "en",
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

  // Two receipts, one document. The first is issued when the money is
  // confirmed and a rider goes out — it carries the delivery code the customer
  // reads at the door. The second closes the transaction once they confirm
  // they received the goods. A customer who has paid deserves something in
  // writing before the rider arrives, not only afterwards.
  const dispatched = order.riderName != null && order.otpCode != null;
  const receiptStage: "DISPATCH" | "DELIVERED" = order.customerConfirmedAt ? "DELIVERED" : "DISPATCH";
  const receiptData: ReceiptPdfData = {
    orderCode: order.orderCode,
    stage: receiptStage,
    receiptNumber: `${order.orderCode.replace(/^UNL-/, "UNL-R-")}-${receiptStage === "DELIVERED" ? "F" : "D"}`,
    otpCode: receiptStage === "DISPATCH" ? order.otpCode : null,
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

  const otpBox = order.otpCode && !isCancelled && (
    <div className="rounded-2xl border border-violet-500/40 bg-violet-950/40 p-4 text-center">
      <p className="text-xs uppercase tracking-wider text-violet-300">{t("confirmation.otpTitle")}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-[0.5em] text-mist-100">{order.otpCode}</p>
      <p className="mt-1 text-xs text-mist-500">{t("confirmation.otpHint")}</p>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-16">
      {/* The order code stays at the top throughout — it is the one thing they
          may be asked for at any moment, whatever stage the order is on. */}
      <div className="rounded-2xl border border-gold-400/40 bg-ink-900 p-4 text-center">
        <p className="text-xs uppercase tracking-wider text-mist-500">{t("confirmation.orderId")}</p>
        <p className="mt-1 font-display text-3xl font-bold tracking-widest text-gold-400">{order.orderCode}</p>
        <p className="mt-1 text-xs text-mist-500">{t("confirmation.keepCode")}</p>
        {verified && (
          <DownloadPdfButton data={pdfData} label={t("confirmation.downloadPdf")} className="mx-auto mt-3" />
        )}
      </div>

      {!isCancelled && <JourneyProgress stages={stages} fr={fr} />}

      {!verified && <VerifyOrderCard orderCode={order.orderCode} maskedPhone={order.customerWhatsapp} />}

      {isCancelled && (
        <div className="rounded-2xl border border-restricted/40 bg-restricted/5 p-4">
          <p className="text-sm font-semibold text-restricted">{t("customerStatus.cancelled")}</p>
        </div>
      )}

      {/* What has already happened, as a receipt of the evening rather than as
          cards still asking to be dealt with. */}
      {done.length > 0 && !finished && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-ink-800 bg-ink-950/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mist-600">
            {fr ? "Déjà fait" : "Done so far"}
          </p>
          {done.map((s) => (
            <JourneyStage key={s.key} stage={s} fr={fr} />
          ))}
        </div>
      )}

      {/* The ending. Everything else on this screen has been put away by now. */}
      {finished ? (
        <Farewell
          name={verified ? order.customerName || null : null}
          nthNight={order.totalOrders > 0 ? order.totalOrders : null}
          riderName={order.riderName}
          deliveredAt={order.deliveredAt ?? order.customerConfirmedAt}
          fr={fr}
        >
          {verified && <DownloadReceiptButton data={receiptData} label={fr ? "Télécharger le reçu final" : "Download your final receipt"} />}
          {verified && (
            <OrderAgain
              fr={fr}
              order={{
                serviceType: order.serviceType,
                itemDescription: order.itemDescription,
                serviceDetails: order.serviceDetails,
                quantity: order.quantity,
                declaredValueXaf: order.declaredValueXaf,
                pickupLocation: order.pickupLocation,
                pickupLandmark: order.pickupLandmark,
                deliveryLocation: order.deliveryLocation,
                deliveryLandmark: order.deliveryLandmark,
                deliveryLat: order.deliveryLat,
                deliveryLng: order.deliveryLng,
                paymentMethod: order.paymentMethod,
                estimatedFeeXaf: order.estimatedFeeXaf,
                isMedicine: order.isMedicine,
                customerName: order.customerName,
                customerWhatsapp: order.customerWhatsapp,
                preferredLanguage: fr ? "FR" : "EN",
              }}
            />
          )}
          {verified && offerAccount && (
            <SaveAccountPrompt fullName={order.customerName} whatsappNumber={order.customerWhatsapp} />
          )}
        </Farewell>
      ) : (
        <>
          {/* Exactly one of these five carries anything to do. */}
          {stages
            .filter((s) => s.state === "ACTIVE")
            .map((s) => (
              <JourneyStage key={s.key} stage={s} fr={fr}>
                {s.key === "PLACED" && open("PLACED") && !order.customerConfirmedAt && (
                  <OrderAlerts orderCode={order.orderCode} fr={fr} />
                )}

                {s.key === "QUOTE" && open("QUOTE") && order.quoteSentAt && order.quotedFeeXaf != null && (
                  <QuoteCard
                    orderCode={order.orderCode}
                    feeXaf={order.quotedFeeXaf}
                    note={order.customerVisibleNotes}
                    accepted={order.quoteAcceptedAt != null}
                    declined={order.quoteDeclinedAt != null}
                    fr={fr}
                  />
                )}

                {s.key === "PAYMENT" && open("PAYMENT") && payment.paymentStatus !== "VERIFIED" && (
                  <PaymentCard info={payment} />
                )}

                {/* Who is coming, before they get here — knowing that is what
                    makes handing a code to a stranger at 1 AM reasonable. */}
                {s.key === "ON_THE_WAY" && open("ON_THE_WAY") && (
                  <>
                    <RiderIdentityCard orderCode={order.orderCode} fr={fr} />
                    <ShareDelivery orderCode={order.orderCode} fr={fr} />
                    {verified && dispatched && (
                      <DownloadReceiptButton
                        data={receiptData}
                        label={fr ? "Télécharger le reçu de paiement" : "Download your payment receipt"}
                      />
                    )}
                  </>
                )}

                {/* The handover: the code and the confirmation, together,
                    because that is how it happens at the door. */}
                {s.key === "RECEIVED" && open("RECEIVED") && (
                  <>
                    {otpBox}
                    {/* Still offered at the door — this is the minute somebody
                        most wants a friend watching, not the minute before. */}
                    <ShareDelivery orderCode={order.orderCode} fr={fr} />
                    <ConfirmReceipt
                      orderCode={order.orderCode}
                      confirmedAt={order.customerConfirmedAt}
                      confirmMethod={order.customerConfirmMethod}
                      canConfirm={CAN_CONFIRM.includes(order.orderStatus)}
                      fr={fr}
                    />
                  </>
                )}
              </JourneyStage>
            ))}

          {/* Where the rider is. Kept outside the stage cards because it is
              something to watch, not something to do. */}
          {!isCancelled && <LiveTrackMap orderCode={order.orderCode} />}

          {/* Offered here as well as at the end, because a guest who never gets
              round to confirming receipt would otherwise never be asked — and
              this is the moment their details are already on the screen. */}
          {verified && offerAccount && (
            <SaveAccountPrompt fullName={order.customerName} whatsappNumber={order.customerWhatsapp} />
          )}

          {/* Named but shut, so the customer knows what is coming without being
              able to reach past the step they are on. */}
          {ahead.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-mist-600">
                {fr ? "Ensuite" : "Still to come"}
              </p>
              {ahead.map((s) => (
                <JourneyStage key={s.key} stage={s} fr={fr} />
              ))}
            </div>
          )}
        </>
      )}

      {/* A complaint belongs on the order it is about — no code to type, no
          context to re-explain, and our reply comes back here. */}
      {verified && <OrderCaseThread orderCode={order.orderCode} fr={fr} />}

      {/* The full timeline, folded away. It is also what keeps this page live:
          it polls the order and refreshes the route when anything moves, so it
          stays mounted whether or not anybody opens it. */}
      <details className="group rounded-2xl border border-ink-800 bg-ink-950/40">
        <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-xs font-semibold text-mist-400">
          {fr ? "Chronologie complète" : "Full timeline"}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
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
      </details>

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
          href={buildWaLink(MAIN_WHATSAPP_NUMBER, `Order ${order.orderCode} — ${order.customerName}`)}
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
