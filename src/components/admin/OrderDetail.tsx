"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  MessageCircle,
  ShieldAlert,
  Gem,
  UserCheck,
  Wallet,
  StickyNote,
  Image as ImageIcon,
  Trash2,
  Mic,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildOrderMessage } from "@/lib/whatsapp/buildOrderMessage";
import { buildWaLink } from "@/lib/whatsapp/links";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { OrderStageBar } from "@/components/admin/OrderStageBar";
import { WorkflowStep, WorkflowProgress } from "@/components/admin/WorkflowStep";
import type { StepKey, StepState } from "@/lib/orders/workflow";
import { dispatchBlocker, isPayOnDelivery, stageOf } from "@/lib/orders/dispatchRules";
import { RiderSuggestions } from "@/components/admin/RiderSuggestions";
import { formatDetailedStatus } from "@/lib/orders/statusLabels";
import { formatSlot } from "@/lib/orders/timeSlots";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { formatXaf, normalizePhone, cn, groupXaf } from "@/lib/utils";
import { ProofReader } from "@/components/admin/ProofReader";
import type {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PreferredLanguage,
  PrescriptionRequired,
  SafetyLevel,
  ServiceType,
} from "@prisma/client";

interface StatusHistoryRow {
  toStatus: OrderStatus;
  fromStatus: OrderStatus | null;
  changedByRole: string | null;
  note: string | null;
  createdAt: string;
}
interface ProofRow {
  stage: string;
  otpEntered: string | null;
  photoUrl: string | null;
  riderNote: string | null;
  createdAt: string;
}

/** One step of the order as the server computed it — see src/lib/orders/workflow.ts. */
export interface AdminWorkflowStep {
  key: StepKey;
  number: number;
  title: string;
  purpose: string;
  state: StepState;
  proof: string | null;
  blockedBy: string | null;
}

export interface OrderDetailData {
  id: string;
  orderCode: string;
  createdAt: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  serviceType: ServiceType;
  customerName: string;
  customerWhatsapp: string;
  alternativePhone: string | null;
  preferredLanguage: PreferredLanguage;
  pickupLocation: string;
  pickupLandmark: string | null;
  pickupZone: string | null;
  pickupSafety: SafetyLevel | null;
  pickupGeoSource: string | null;
  pickupGeoConfidence: number | null;
  deliveryLocation: string;
  deliveryLandmark: string | null;
  deliveryZone: string | null;
  deliverySafety: SafetyLevel | null;
  deliveryGeoSource: string | null;
  deliveryGeoConfidence: number | null;
  merchantName: string | null;
  merchantWhatsapp: string | null;
  itemDescription: string;
  serviceDetails: Record<string, unknown> | null;
  quantity: number;
  declaredValueXaf: number;
  isFragile: boolean;
  needsTemperatureCare: boolean;
  isMedicine: boolean;
  prescriptionRequired: PrescriptionRequired | null;
  itemAlreadyPaid: boolean;
  riderPaysAtPickup: boolean;
  preferredDeliveryTime: string | null;
  specialInstructions: string | null;
  paymentMethod: PaymentMethod;
  paymentPhone: string | null;
  transactionReference: string | null;
  paymentProofUrl: string | null;
  estimatedDeliveryFeeXaf: number | null;
  finalDeliveryFeeXaf: number | null;
  totalAmountDueXaf: number | null;
  riskFlag: boolean;
  highValueFlag: boolean;
  rejectionReason: string | null;
  adminNotes: string | null;
  customerVisibleNotes: string | null;
  assignedRiderId: string | null;
  quoteSentAt: string | null;
  quoteAcceptedAt: string | null;
  quoteDeclinedAt: string | null;
  quoteDeclineReason: string | null;
  quotedFeeXaf: number | null;
  riderAcceptedAt: string | null;
  riderSharePercent: number | null;
  riderPayoutXaf: number | null;
  companyEarningXaf: number | null;
  cashCollectedXaf: number | null;
  cashSettledAt: string | null;
  isTest: boolean;
  archived: boolean;
  customerConfirmedAt: string | null;
  customerConfirmMethod: string | null;
  customerProofUrl: string | null;
  customerNotifiedAt: string | null;
  customerNotifiedStage: string | null;
  riderLat: number | null;
  riderLng: number | null;
  riderLocationAt: string | null;
  otpCode: string | null;
  screenshotUrl: string | null;
  voiceNoteUrl: string | null;
  voiceTranscript: string | null;
  safetyFlag: string | null;
  voiceNoteSeconds: number | null;
  statusHistory: StatusHistoryRow[];
  proofs: ProofRow[];
  auditTrail: AuditRow[];
}

/** A rider, ranked for this particular drop-off. */
export interface RiderOption {
  id: string;
  fullName: string;
  coversZone: boolean;
  isOnline: boolean;
  zoneDeliveries: number;
  zoneSuccessRate: number | null;
}

export interface AuditRow {
  actorName: string;
  actorRole: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  reason: string | null;
  createdAt: string;
}

const REJECTION_REASONS = [
  "OUTSIDE_ZONE",
  "UNSAFE_AREA",
  "AFTER_HOURS",
  "RESTRICTED_ITEM",
  "HIGH_VALUE_UNDECLARED",
  "CUSTOMER_UNREACHABLE",
  "PAYMENT_NOT_CONFIRMED",
  "MERCHANT_UNAVAILABLE",
  "RIDER_UNAVAILABLE",
  "OTHER",
] as const;

/**
 * Coordinates with a source were *guessed* from the customer's typed address,
 * not pinned by them. Dispatch has to know that before routing a rider — a weak
 * match is a hint, never an address.
 */
function GeoNote({ source, confidence }: { source: string | null; confidence: number | null }) {
  if (!source) return null;
  const weak = (confidence ?? 0) < 0.6;
  const origin = source === "CATALOGUE" ? "our location list" : "OpenStreetMap";
  return (
    <span className={`block text-xs ${weak ? "text-gold-300" : "text-mist-500"}`}>
      Position estimated from the typed address via {origin}
      {confidence != null ? ` (${Math.round(confidence * 100)}% match)` : ""}
      {weak ? " — confirm with the customer before dispatching." : ""}
    </span>
  );
}

/** Plain-language names for the audit actions, in the order they usually occur. */
const AUDIT_LABEL: Record<string, string> = {
  "order.quoted": "Priced and sent to the customer",
  "order.requoted": "Re-priced — the customer must agree again",
  "order.quote_accepted": "Customer accepted the price",
  "order.quote_declined": "Customer declined the price",
  "order.updated": "Order edited",
  "order.rider_assigned": "Rider assigned",
  "order.assignment_accepted": "Rider accepted the assignment",
  "order.assignment_declined": "Rider declined the assignment",
  "order.archived": "Archived",
  "order.unarchived": "Restored from archive",
  "order.deleted": "Deleted",
};

const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";
const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-mist-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function OrderDetail({
  order,
  riders,
  steps,
  isOwner = false,
}: {
  order: OrderDetailData;
  riders: RiderOption[];
  /** The six steps, worked out on the server so the screen and the API agree. */
  steps: AdminWorkflowStep[];
  /** Deleting an order is owner-only, so the control is owner-only too. */
  isOwner?: boolean;
}) {
  const { t, locale: uiLocale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [rejectReason, setRejectReason] = useState<string>("OUTSIDE_ZONE");
  const [showReject, setShowReject] = useState(false);
  const [riderId, setRiderId] = useState(order.assignedRiderId ?? "");
  const [fee, setFee] = useState(order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0);
  const [totalDue, setTotalDue] = useState(order.totalAmountDueXaf ?? 0);
  const [verifyNote, setVerifyNote] = useState("");
  const [quoteFee, setQuoteFee] = useState(
    order.quotedFeeXaf ?? order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0
  );
  const [quoteNote, setQuoteNote] = useState("");
  const [quoteLinkCopied, setQuoteLinkCopied] = useState(false);
  const [housekeepingReason, setHousekeepingReason] = useState("");
  const [adminNote, setAdminNote] = useState(order.adminNotes ?? "");
  const [customerNote, setCustomerNote] = useState(order.customerVisibleNotes ?? "");

  const locale = order.preferredLanguage === "FR" ? "fr" : "en";

  // One shared reading of where this order stands, so the stage bar, the
  // dispatch guard and the assign button cannot disagree with each other or
  // with the endpoint that will actually refuse the assignment.
  const gate = {
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    quoteSentAt: order.quoteSentAt,
    quoteAcceptedAt: order.quoteAcceptedAt,
    quoteDeclinedAt: order.quoteDeclinedAt,
    assignedRiderId: order.assignedRiderId,
    customerConfirmedAt: order.customerConfirmedAt,
  };
  const stage = stageOf(gate);

  /**
   * Feeds one step's heading, state and evidence into the wrapper.
   *
   * Everything comes from the server's workflow rather than being re-derived
   * here, so what the screen allows and what the API allows cannot drift apart.
   */
  function stepProps(key: StepKey) {
    const step = steps.find((s) => s.key === key);
    return {
      number: step?.number ?? 0,
      title: step?.title ?? "",
      purpose: step?.purpose ?? "",
      state: step?.state ?? ("LOCKED" as StepState),
      proof: step?.proof ?? null,
      blockedBy: step?.blockedBy ?? null,
    };
  }
  const stepsDone = steps.filter((s) => s.state === "DONE").length;
  const dispatchStop = dispatchBlocker(gate);
  const payOnDelivery = isPayOnDelivery(order.paymentMethod);

  // Short enough to read down a phone line or paste into a chat without
  // wrapping — this address is handled by people, not just clicked.
  const origin = typeof window === "undefined" ? "https://urbannighlift.com" : window.location.origin;
  const quoteLink = `${origin}/q/${order.orderCode}`;
  const trackLink = `${origin}/order/confirmation/${order.orderCode}`;

  async function copyQuoteLink() {
    try {
      await navigator.clipboard.writeText(quoteLink);
    } catch {
      window.prompt("Copy this link and send it to the customer:", quoteLink);
    }
    setQuoteLinkCopied(true);
    setTimeout(() => setQuoteLinkCopied(false), 2500);
  }
  const waMessage = buildOrderMessage({
    orderCode: order.orderCode,
    createdAt: order.createdAt,
    customerName: order.customerName,
    customerWhatsapp: order.customerWhatsapp,
    language: locale,
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
    paymentPhone: order.paymentPhone,
    transactionReference: order.transactionReference,
    specialInstructions: order.specialInstructions,
  });

  async function call(url: string, body: unknown, method = "POST") {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("common.error"));
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  const setStatus = (status: OrderStatus, extra: Record<string, unknown> = {}) =>
    call(`/api/orders/${order.id}/status`, { status, ...extra });
  const patch = (body: Record<string, unknown>) =>
    call(`/api/orders/${order.id}`, body, "PATCH");

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-gold-400">{order.orderCode}</h1>
            {order.highValueFlag && (
              <Badge tone="gold">
                <Gem className="h-3 w-3" /> High value
              </Badge>
            )}
            {order.riskFlag && (
              <Badge tone="restricted">
                <ShieldAlert className="h-3 w-3" /> Risk
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <OrderStatusBadge status={order.orderStatus} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>
        {order.otpCode && (
          <div className="rounded-xl border border-violet-500/40 bg-violet-950/40 px-3 py-2 text-center">
            <p className="text-xs uppercase text-violet-300">OTP</p>
            <p className="font-display text-lg font-bold tracking-widest">{order.otpCode}</p>
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-restricted/10 px-3 py-2 text-sm text-restricted">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column: details */}
        <div className="flex flex-col gap-5">
          <section className={card}>
            <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">{t("admin.order.customerInfo")}</h2>
            <Row label={t("orderForm.fullName")} value={order.customerName} />
            <Row label="WhatsApp" value={order.customerWhatsapp} />
            <Row label={t("orderForm.alternativePhone")} value={order.alternativePhone} />
            <Row label={t("orderForm.preferredLanguage")} value={order.preferredLanguage} />
          </section>

          <section className={card}>
            <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">{t("admin.order.orderInfo")}</h2>
            <Row label={t("orderForm.serviceType")} value={t(`services.${order.serviceType}.name`)} />
            <Row label={t("orderForm.itemDescription")} value={order.itemDescription} />
            {order.serviceDetails && (
              <Row
                label="Service details"
                value={
                  <span className="whitespace-pre-line text-right text-xs">
                    {Object.entries(order.serviceDetails)
                      .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
                      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((o) => (typeof o === "object" && o ? Object.values(o as object).filter(Boolean).join(" ") : String(o))).join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                      .join("\n")}
                  </span>
                }
              />
            )}
            <Row label={t("orderForm.quantity")} value={order.quantity} />
            <Row label={t("review.declaredValue")} value={formatXaf(order.declaredValueXaf)} />
            <Row label={t("orderForm.isFragile")} value={order.isFragile ? t("common.yes") : t("common.no")} />
            <Row label={t("orderForm.needsTemperatureCare")} value={order.needsTemperatureCare ? t("common.yes") : t("common.no")} />
            <Row label={t("orderForm.isMedicine")} value={order.isMedicine ? t("common.yes") : t("common.no")} />
            {order.isMedicine && (
              <Row
                label={t("orderForm.prescriptionRequired")}
                value={order.prescriptionRequired ?? "—"}
              />
            )}
            <Row label={t("orderForm.itemAlreadyPaid")} value={order.itemAlreadyPaid ? t("common.yes") : t("common.no")} />
            <Row label={t("orderForm.riderPaysAtPickup")} value={order.riderPaysAtPickup ? t("common.yes") : t("common.no")} />
            <Row
              label={t("orderForm.preferredDeliveryTime")}
              value={formatSlot(order.preferredDeliveryTime, uiLocale === "fr")}
            />
            <Row label={t("orderForm.specialInstructions")} value={order.specialInstructions} />
          </section>

          <section className={card}>
            <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">{t("admin.order.locations")}</h2>
            <Row
              label={t("review.pickup")}
              value={
                <span>
                  {order.pickupLocation}
                  {order.pickupLandmark ? <span className="block text-xs text-mist-500">{order.pickupLandmark}</span> : null}
                  {order.pickupZone ? <span className="block text-xs text-violet-300">{order.pickupZone} · {order.pickupSafety}</span> : null}
                  <GeoNote source={order.pickupGeoSource} confidence={order.pickupGeoConfidence} />
                </span>
              }
            />
            <Row
              label={t("review.delivery")}
              value={
                <span>
                  {order.deliveryLocation}
                  {order.deliveryLandmark ? <span className="block text-xs text-mist-500">{order.deliveryLandmark}</span> : null}
                  {order.deliveryZone ? <span className="block text-xs text-violet-300">{order.deliveryZone} · {order.deliverySafety}</span> : null}
                  <GeoNote source={order.deliveryGeoSource} confidence={order.deliveryGeoConfidence} />
                </span>
              }
            />
            {order.merchantName && <Row label="Merchant" value={order.merchantName} />}
            {order.riderLat != null && order.riderLng != null && (
              <Row
                label="Rider live position"
                value={
                  <span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${order.riderLat},${order.riderLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 underline"
                    >
                      {order.riderLat.toFixed(5)}, {order.riderLng.toFixed(5)}
                    </a>
                    {order.riderLocationAt ? (
                      <span className="block text-xs text-mist-500">
                        {new Date(order.riderLocationAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : null}
                  </span>
                }
              />
            )}
          </section>

          <section className={card}>
            <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">{t("admin.order.statusHistory")}</h2>
            <ol className="flex flex-col gap-1.5">
              {order.statusHistory.map((h, i) => (
                <li key={i} className="text-xs">
                  <span className="text-mist-500">
                    {new Date(h.createdAt).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>{" "}
                  <span className="font-medium text-mist-200">{formatDetailedStatus(h.toStatus)}</span>
                  {h.changedByRole ? <span className="text-mist-500"> · {h.changedByRole}</span> : null}
                  {h.note ? <span className="block text-mist-500">↳ {h.note}</span> : null}
                </li>
              ))}
            </ol>
          </section>

          {/* Activity — every privileged change to this order and who made it.
              Fee edits and rider assignment used to leave no trace at all. */}
          {order.auditTrail.length > 0 && (
            <section className={card}>
              <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">Activity</h2>
              <ol className="flex flex-col gap-2">
                {order.auditTrail.map((a, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-mist-500">
                      {new Date(a.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    <span className="font-medium text-mist-200">{AUDIT_LABEL[a.action] ?? a.action}</span>
                    <span className="text-mist-500">
                      {" "}
                      · {a.actorName} ({a.actorRole})
                    </span>
                    {a.changes &&
                      Object.entries(a.changes).map(([field, v]) => (
                        <span key={field} className="block text-mist-500">
                          ↳ {field}: {String(v.from ?? "—")} → {String(v.to ?? "—")}
                        </span>
                      ))}
                    {a.reason ? <span className="block text-mist-500">↳ {a.reason}</span> : null}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {order.proofs.length > 0 && (
            <section className={card}>
              <h2 className="mb-2 font-display text-sm font-semibold text-gold-300">{t("admin.order.proofs")}</h2>
              {order.proofs.map((p, i) => (
                <div key={i} className="border-t border-ink-700 py-2 text-xs first:border-0">
                  <Badge tone="violet">{p.stage}</Badge>
                  {p.otpEntered && <span className="ml-2">OTP: {p.otpEntered}</span>}
                  {p.riderNote && <p className="mt-1 text-mist-500">{p.riderNote}</p>}
                  {p.photoUrl && <p className="mt-1 text-mist-500">Photo: {p.photoUrl}</p>}
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Right column: actions */}
        <div className="flex flex-col gap-5">
          <OrderStageBar stage={stage} blocker={dispatchStop?.message ?? null} />
          <WorkflowProgress done={stepsDone} total={steps.length} />

          <WorkflowStep {...stepProps("REVIEW")}>

            {/* The customer said it out loud instead of typing it. Listen
                before pricing — the note usually holds detail the form fields
                never asked for. Served through the staff-gated media route
                because it carries their voice and their address. */}
            {order.voiceNoteUrl && (
              <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-950/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-200">
                  <Mic className="h-3.5 w-3.5" /> Voice note from the customer
                  {order.voiceNoteSeconds ? ` · ${order.voiceNoteSeconds}s` : ""}
                </p>
                <audio
                  controls
                  preload="none"
                  src={`/api/media?path=${encodeURIComponent(order.voiceNoteUrl)}`}
                  className="h-9 w-full"
                />
                {/* The words, so a dispatcher with four orders open can read in
                    two seconds what would take forty to listen to — and so the
                    note is searchable, which audio never is. The player stays
                    directly above it: this is a second opinion on the
                    recording, never a replacement for it, and if the words look
                    wrong the truth is one tap away. */}
                {order.voiceTranscript && (
                  <p className="mt-2 rounded-lg border border-ink-700 bg-ink-950 p-2 text-xs leading-relaxed text-mist-200">
                    {order.voiceTranscript}
                  </p>
                )}
                <p className="mt-1 text-xs text-mist-500">Staff only — never shared with anyone else.</p>
              </div>
            )}

            {/* Something in what they wrote is worth reading before a rider is
                sent. Never a refusal — the order is live and orderable, and
                this only asks for a glance. Dispatch judges; the model does
                not. */}
            {order.safetyFlag && (
              <div className="mb-3 rounded-xl border border-restricted/50 bg-restricted/10 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-restricted">
                  <ShieldAlert className="h-3.5 w-3.5" /> Read this before sending a rider
                </p>
                <p className="text-xs leading-relaxed text-mist-200">{order.safetyFlag}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-mist-500">
                  Raised automatically from what the customer typed. It is a prompt to look, not a
                  judgement — most turn out to be fine, and the decision is yours.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" onClick={() => setStatus("APPROVED")} disabled={pending}>
                  <Check className="h-4 w-4" /> {t("admin.order.approve")}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setShowReject((v) => !v)} disabled={pending}>
                  <X className="h-4 w-4" /> {t("admin.order.reject")}
                </Button>
              </div>

              {showReject && (
                <div className="rounded-xl border border-ink-700 bg-ink-800 p-3">
                  <select className={inputCls} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
                    {REJECTION_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`admin.order.reasons.${r}`)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="danger"
                    className="mt-2 w-full"
                    disabled={pending}
                    onClick={() =>
                      setStatus("REJECTED", { rejectionReason: t(`admin.order.reasons.${rejectReason}`) })
                    }
                  >
                    {t("admin.order.reject")}
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => patch({ highValueFlag: !order.highValueFlag })}
                >
                  {order.highValueFlag ? t("admin.order.unmarkHighValue") : t("admin.order.markHighValue")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => patch({ riskFlag: !order.riskFlag })}
                >
                  {order.riskFlag ? t("admin.order.unmarkRisk") : t("admin.order.markRisk")}
                </Button>
              </div>

              <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus("SAFETY_HOLD")}>
                <ShieldAlert className="h-4 w-4" /> Safety hold
              </Button>
              <Button size="sm" variant="danger" disabled={pending} onClick={() => setStatus("CANCELLED_BY_UNL")}>
                {t("admin.order.cancelOrder")}
              </Button>
            </div>
          </WorkflowStep>

          {/* Quote — accept the order at a price and send it to the customer.
              No rider may be assigned until they have agreed to it. */}
          <WorkflowStep {...stepProps("QUOTE")}>
            <p className="mb-3 text-xs text-mist-500">
              Saving the price does not message the customer on its own — send them the link that
              appears below. No rider can be assigned until they accept it.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  type="number"
                  value={quoteFee}
                  onChange={(e) => setQuoteFee(Number(e.target.value))}
                  aria-label="Delivery fee in XAF"
                />
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => call(`/api/orders/${order.id}/quote`, { feeXaf: quoteFee, note: quoteNote })}
                >
                  {order.quoteSentAt ? "Update price" : "Save price"}
                </Button>
              </div>
              <input
                className={inputCls}
                placeholder="Optional note for the customer"
                value={quoteNote}
                onChange={(e) => setQuoteNote(e.target.value)}
              />
              {order.quoteAcceptedAt ? (
                <p className="text-xs text-safe">
                  Customer accepted {order.quotedFeeXaf != null ? formatXaf(order.quotedFeeXaf) : "the price"} on{" "}
                  {new Date(order.quoteAcceptedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : order.quoteDeclinedAt ? (
                <p className="text-xs text-restricted">
                  Customer declined the price{order.quoteDeclineReason ? ` — ${order.quoteDeclineReason}` : ""}
                </p>
              ) : order.quoteSentAt ? (
                <p className="text-xs text-gold-300">Priced — the customer still has to be sent the link and accept.</p>
              ) : (
                <p className="text-xs text-mist-500">Not priced yet.</p>
              )}

              {/* Saving a price notifies nobody a guest can receive: push only
                  reaches people who opted in. The link is the delivery, so it
                  sits here, next to the number it refers to. */}
              {order.quoteSentAt && !order.quoteAcceptedAt && !order.quoteDeclinedAt && (
                <div className="rounded-xl border border-gold-400/30 bg-gold-400/5 p-3">
                  <p className="text-xs text-gold-200">
                    Send this link to the customer — it shows the price and the Accept button.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-ink-800 px-2 py-1 text-xs text-mist-200">{quoteLink}</code>
                    <Button size="sm" variant="outline" onClick={copyQuoteLink}>
                      {quoteLinkCopied ? "Copied" : "Copy link"}
                    </Button>
                    <a
                      href={buildWaLink(
                        normalizePhone(order.customerWhatsapp),
                        `Urban Night Lift — order ${order.orderCode}.\n\nGood news, we've accepted your order. Delivery is ${groupXaf(order.quotedFeeXaf ?? 0)} XAF.\n\nTap to see the details and confirm:\n${quoteLink}\n\nWe'll assign a rider as soon as you accept.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => call(`/api/orders/${order.id}/notified`, { stage: "QUOTE" })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-ink-950"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Send it now
                    </a>
                  </div>
                </div>
              )}
            </div>
          </WorkflowStep>

          {/* Telling the customer. Push only reaches people who opted in, so
              the reliable channel is still a person sending WhatsApp — and the
              order records that it happened, so nobody has to assume. */}
          <section className={card}>
            <h2 className="mb-1 font-display text-sm font-semibold text-gold-300">Messages to the customer</h2>
            {order.customerNotifiedAt ? (
              <p className="mb-2 text-xs text-safe">
                Last told{" "}
                {new Date(order.customerNotifiedAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {order.customerNotifiedStage ? ` (${order.customerNotifiedStage.toLowerCase()})` : ""}
              </p>
            ) : (
              <p className="mb-2 rounded-xl border border-caution/30 bg-caution/10 p-2 text-xs text-gold-200">
                Nobody has told this customer anything yet.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <a
                href={buildWaLink(
                  normalizePhone(order.customerWhatsapp),
                  order.quotedFeeXaf != null
                    ? `Urban Night Lift — order ${order.orderCode}.\n\nGood news, we've accepted your order. Delivery is ${groupXaf(order.quotedFeeXaf)} XAF.\n\nTap to see the details and confirm:\n${quoteLink}\n\nWe'll assign a rider as soon as you accept.`
                    : `Urban Night Lift — order ${order.orderCode}. We've received your order and are reviewing it now.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => call(`/api/orders/${order.id}/notified`, { stage: "QUOTE" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-ink-950"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Send price on WhatsApp
              </a>
              <a
                href={buildWaLink(
                  normalizePhone(order.customerWhatsapp),
                  `Urban Night Lift — order ${order.orderCode}. Your rider is on the way with your order. Have your delivery code ready.\n\nTrack it here:\n${trackLink}`
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => call(`/api/orders/${order.id}/notified`, { stage: "DISPATCH" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-semibold text-mist-200"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Send dispatch update
              </a>
            </div>
            <p className="mt-2 text-xs text-mist-500">
              Sending opens WhatsApp with the message written for you and marks the order as told.
            </p>
          </section>

          {/* Payment verification */}
          <WorkflowStep {...stepProps("PAYMENT")}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
            </h2>
            <p className="mb-3 text-xs text-mist-500">
              {payOnDelivery
                ? "Cash on delivery — the rider collects at the door, so dispatch is not held up waiting for this."
                : "Verifying the payment is what releases the order for a rider. Check the proof before confirming."}
            </p>
            <Row label={t("orderForm.paymentMethod")} value={order.paymentMethod === "MTN_MOMO" ? "MTN MoMo" : order.paymentMethod === "ORANGE_MONEY" ? "Orange Money" : "Cash on delivery"} />
            <Row label={t("orderForm.paymentPhone")} value={order.paymentPhone} />
            <Row label={t("orderForm.transactionReference")} value={order.transactionReference} />
            {order.paymentProofUrl && (
              <Row
                label="Payment proof"
                value={
                  <a href={`/api/media?path=${encodeURIComponent(order.paymentProofUrl)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-gold-400/15 px-2.5 py-1 text-xs font-semibold text-gold-300">
                    <ImageIcon className="h-3.5 w-3.5" /> View screenshot
                  </a>
                }
              />
            )}
            {/* Suggests the reference off the image. It never verifies — that
                decision releases somebody's goods to a rider. */}
            {order.paymentProofUrl && !payOnDelivery && <ProofReader orderId={order.id} />}
            <div className="mt-2 flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => call(`/api/payments/${order.id}/verify`, { status: "SUBMITTED_UNVERIFIED" })}
              >
                {t("admin.order.markPaymentSubmitted")}
              </Button>
              <textarea
                className={inputCls}
                placeholder={t("admin.order.verificationNote")}
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-mist-500">{t("admin.order.verificationRequired")}</p>
              <Button
                size="sm"
                disabled={pending || verifyNote.trim().length < 3}
                onClick={() => call(`/api/payments/${order.id}/verify`, { status: "VERIFIED", note: verifyNote })}
              >
                <Check className="h-4 w-4" /> {t("admin.order.confirmPayment")}
              </Button>
            </div>
          </WorkflowStep>

          {/* Rider + fees */}
          <WorkflowStep {...stepProps("DISPATCH")}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
            </h2>
            {dispatchStop && (
              <p className="mb-2 rounded-xl border border-caution/30 bg-caution/10 p-2 text-xs text-gold-200">
                {dispatchStop.message} A rider is only committed once the price is agreed and the money is
                in — otherwise we pay for a trip that can be refused at the door.
              </p>
            )}
            {order.assignedRiderId && (
              <p className="mb-2 text-xs">
                {order.riderAcceptedAt ? (
                  <span className="text-safe">
                    Rider accepted on{" "}
                    {new Date(order.riderAcceptedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : (
                  <span className="text-gold-300">Waiting for the rider to accept this assignment.</span>
                )}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {/* The shortcut past the dropdown: who should take this, ranked,
                  with the reasons written out. It proposes and a person
                  presses — picking one only fills the select below, so the
                  same Assign button and the same money gate still apply. */}
              {!order.assignedRiderId && (
                <RiderSuggestions
                  orderId={order.id}
                  disabled={pending || dispatchStop != null}
                  onPick={setRiderId}
                  fr={false}
                />
              )}
              {/* Riders who cover this zone come first, then whoever is
                  online. A rider who knows the area finds a landmark address
                  the next name on the list would spend twenty minutes on. */}
              <select className={inputCls} value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                <option value="">{t("admin.order.selectRider")}</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.coversZone ? "✓" : "○"} {r.fullName}
                    {r.isOnline ? " · online" : " · offline"}
                    {r.zoneDeliveries > 0
                      ? ` · ${r.zoneDeliveries} here${r.zoneSuccessRate != null ? ` (${r.zoneSuccessRate}%)` : ""}`
                      : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-mist-500">
                ✓ covers this delivery zone · the count is how many deliveries they have completed there.
              </p>
              <Button
                size="sm"
                disabled={pending || (dispatchStop != null && riderId !== "")}
                onClick={async () => {
                  const ok = await patch({ assignedRiderId: riderId });
                  if (ok && riderId && order.orderStatus !== "RIDER_ASSIGNED") {
                    await setStatus("RIDER_ASSIGNED");
                  }
                }}
              >
                {t("admin.order.assignRider")}
              </Button>
              {payOnDelivery && !dispatchStop && (
                <p className="text-xs text-mist-500">
                  Cash on delivery — there is nothing to verify before dispatch. The rider collects
                  {order.quotedFeeXaf != null ? ` ${formatXaf(order.quotedFeeXaf)}` : ""} at the door and it
                  settles through their cash balance.
                </p>
              )}
              {order.otpCode == null && !dispatchStop && (
                <p className="text-xs text-mist-500">
                  Assigning generates the customer&apos;s delivery code and sends it to them with their receipt.
                </p>
              )}

              <label className="mt-2 block text-xs text-mist-500">{t("admin.order.updateFee")}</label>
              <div className="flex gap-2">
                <input className={inputCls} type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
                <Button size="sm" variant="outline" disabled={pending} onClick={() => patch({ finalDeliveryFeeXaf: fee })}>
                  {t("common.save")}
                </Button>
              </div>
              <label className="mt-1 block text-xs text-mist-500">{t("admin.order.updateTotal")}</label>
              <div className="flex gap-2">
                <input className={inputCls} type="number" value={totalDue} onChange={(e) => setTotalDue(Number(e.target.value))} />
                <Button size="sm" variant="outline" disabled={pending} onClick={() => patch({ totalAmountDueXaf: totalDue })}>
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </WorkflowStep>

          {/* The customer's own confirmation. Dispatch needs to see both
              sides of the handover, not just the rider's word for it. */}
          <WorkflowStep {...stepProps("PROOF")}>
            {order.customerConfirmedAt ? (
              <div className="flex flex-col gap-1.5 text-sm">
                <Row
                  label="Customer confirmed"
                  value={
                    <span className="text-safe">
                      {new Date(order.customerConfirmedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  }
                />
                <Row
                  label="Method"
                  value={
                    order.customerConfirmMethod === "SIGNATURE"
                      ? "Signed on their device"
                      : order.customerConfirmMethod === "PHOTO"
                        ? "Photo of the handover"
                        : "Entered the delivery code"
                  }
                />
                {order.customerProofUrl && (
                  <Row
                    label="Evidence"
                    value={
                      <button
                        type="button"
                        className="text-violet-300 underline"
                        onClick={async () => {
                          const res = await fetch(
                            `/api/media?path=${encodeURIComponent(order.customerProofUrl!)}`
                          );
                          if (!res.ok) {
                            setError("Couldn't open the file");
                            return;
                          }
                          const { url } = await res.json();
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        View signature / photo
                      </button>
                    }
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-mist-500">
                The customer hasn&apos;t confirmed receipt yet. They can enter their delivery code, sign, or send a
                photo from their own order page.
              </p>
            )}
          </WorkflowStep>

          {/* Earnings — the 60/40 split, frozen at delivery. */}
          {order.riderPayoutXaf != null && order.companyEarningXaf != null && (
            <WorkflowStep {...stepProps("SETTLE")}>
              <div className="flex flex-col gap-1.5 text-sm">
                <Row label={`Rider (${order.riderSharePercent ?? 60}%)`} value={formatXaf(order.riderPayoutXaf)} />
                <Row label={`Urban Night Lift (${100 - (order.riderSharePercent ?? 60)}%)`} value={formatXaf(order.companyEarningXaf)} />
                {order.paymentMethod === "CASH" && (
                  <>
                    <Row label="Cash collected by rider" value={order.cashCollectedXaf != null ? formatXaf(order.cashCollectedXaf) : "—"} />
                    <Row
                      label="Rider owes us"
                      value={
                        <span className={order.cashSettledAt ? "text-safe" : "text-gold-300"}>
                          {formatXaf(Math.max(0, (order.cashCollectedXaf ?? 0) - order.riderPayoutXaf))}
                          {order.cashSettledAt ? " · settled" : " · outstanding"}
                        </span>
                      }
                    />
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-mist-500">
                The split is fixed at the rate in force when the order was delivered, so changing the rate later never
                rewrites completed accounts.
              </p>
            </WorkflowStep>
          )}

          {/* Housekeeping — test data, archiving, and (owner only) deletion. */}
          <section className={card}>
            <h2 className="mb-1 font-display text-sm font-semibold text-gold-300">Housekeeping</h2>
            <p className="mb-3 text-xs text-mist-500">
              Test and archived orders leave every list, count and export. Nothing here destroys history — every action
              is recorded against your name.
            </p>
            <div className="flex flex-col gap-2">
              <input
                className={inputCls}
                placeholder="Reason (recorded in the audit log)"
                value={housekeepingReason}
                onChange={(e) => setHousekeepingReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => patch({ isTest: !order.isTest })}>
                  {order.isTest ? "Unmark as test" : "Mark as test order"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    call(`/api/orders/${order.id}/archive`, {
                      archive: !order.archived,
                      reason: housekeepingReason,
                    })
                  }
                >
                  {order.archived ? "Restore from archive" : "Archive"}
                </Button>
                {isOwner && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="border-restricted/50 text-restricted"
                    onClick={async () => {
                      if (housekeepingReason.trim().length < 3) {
                        setError("Type a reason before deleting.");
                        return;
                      }
                      if (!confirm(`Permanently delete ${order.orderCode}? This cannot be undone.`)) return;
                      const ok = await call(
                        `/api/orders/${order.id}/archive`,
                        { reason: housekeepingReason },
                        "DELETE"
                      );
                      if (ok) router.push("/admin/orders");
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete permanently
                  </Button>
                )}
              </div>
              {isOwner && (
                <p className="text-xs text-mist-500">
                  Deleting is permanent and owner-only. An order with a verified payment cannot be deleted at all —
                  archive it instead.
                </p>
              )}
            </div>
          </section>

          {/* WhatsApp contact */}
          <section className={card}>
            <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">{t("common.whatsapp")}</h2>
            <div className="flex flex-col gap-2">
              <a
                href={buildWaLink(normalizePhone(order.customerWhatsapp), waMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-ink-950"
              >
                <MessageCircle className="h-4 w-4" /> {t("admin.order.waCustomer")}
              </a>
              {order.merchantWhatsapp && (
                <a
                  href={buildWaLink(normalizePhone(order.merchantWhatsapp), `Order ${order.orderCode}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-ink-700 px-4 py-2 text-sm"
                >
                  <MessageCircle className="h-4 w-4" /> {t("admin.order.waMerchant")}
                </a>
              )}
            </div>
          </section>

          {/* Notes */}
          <section className={card}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
              <StickyNote className="h-4 w-4" /> Notes
            </h2>
            <label className="block text-xs text-mist-500">{t("admin.order.internalNotes")}</label>
            <textarea className={cn(inputCls, "mt-1")} rows={2} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            <Button size="sm" variant="outline" className="mt-1" disabled={pending} onClick={() => patch({ adminNotes: adminNote })}>
              {t("common.save")}
            </Button>
            <label className="mt-3 block text-xs text-mist-500">{t("admin.order.customerNotes")}</label>
            <textarea className={cn(inputCls, "mt-1")} rows={2} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
            <Button size="sm" variant="outline" className="mt-1" disabled={pending} onClick={() => patch({ customerVisibleNotes: customerNote })}>
              {t("common.save")}
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
