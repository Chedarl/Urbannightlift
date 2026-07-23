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
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildOrderMessage } from "@/lib/whatsapp/buildOrderMessage";
import { buildWaLink } from "@/lib/whatsapp/links";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { formatDetailedStatus } from "@/lib/orders/statusLabels";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { formatXaf, normalizePhone, cn } from "@/lib/utils";
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
  deliveryLocation: string;
  deliveryLandmark: string | null;
  deliveryZone: string | null;
  deliverySafety: SafetyLevel | null;
  merchantName: string | null;
  merchantWhatsapp: string | null;
  itemDescription: string;
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
  estimatedDeliveryFeeXaf: number | null;
  finalDeliveryFeeXaf: number | null;
  totalAmountDueXaf: number | null;
  riskFlag: boolean;
  highValueFlag: boolean;
  rejectionReason: string | null;
  adminNotes: string | null;
  customerVisibleNotes: string | null;
  assignedRiderId: string | null;
  otpCode: string | null;
  screenshotUrl: string | null;
  statusHistory: StatusHistoryRow[];
  proofs: ProofRow[];
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
}: {
  order: OrderDetailData;
  riders: { id: string; fullName: string }[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [rejectReason, setRejectReason] = useState<string>("OUTSIDE_ZONE");
  const [showReject, setShowReject] = useState(false);
  const [riderId, setRiderId] = useState(order.assignedRiderId ?? "");
  const [fee, setFee] = useState(order.finalDeliveryFeeXaf ?? order.estimatedDeliveryFeeXaf ?? 0);
  const [totalDue, setTotalDue] = useState(order.totalAmountDueXaf ?? 0);
  const [verifyNote, setVerifyNote] = useState("");
  const [adminNote, setAdminNote] = useState(order.adminNotes ?? "");
  const [customerNote, setCustomerNote] = useState(order.customerVisibleNotes ?? "");

  const locale = order.preferredLanguage === "FR" ? "fr" : "en";
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
    paymentMethodLabel: order.paymentMethod === "MTN_MOMO" ? "MTN MOMO" : "ORANGE MONEY",
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
            <p className="text-[10px] uppercase text-violet-300">OTP</p>
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
            <Row label={t("orderForm.preferredDeliveryTime")} value={order.preferredDeliveryTime} />
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
                </span>
              }
            />
            {order.merchantName && <Row label="Merchant" value={order.merchantName} />}
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
          <section className={card}>
            <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">{t("admin.order.actions")}</h2>
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
          </section>

          {/* Payment verification */}
          <section className={card}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
              <Wallet className="h-4 w-4" /> {t("admin.order.payment")}
            </h2>
            <Row label={t("orderForm.paymentMethod")} value={order.paymentMethod === "MTN_MOMO" ? "MTN MoMo" : "Orange Money"} />
            <Row label={t("orderForm.paymentPhone")} value={order.paymentPhone} />
            <Row label={t("orderForm.transactionReference")} value={order.transactionReference} />
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
          </section>

          {/* Rider + fees */}
          <section className={card}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
              <UserCheck className="h-4 w-4" /> {t("admin.order.assignRider")}
            </h2>
            <div className="flex flex-col gap-2">
              <select className={inputCls} value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                <option value="">{t("admin.order.selectRider")}</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={pending}
                onClick={async () => {
                  const ok = await patch({ assignedRiderId: riderId });
                  if (ok && riderId && order.orderStatus !== "RIDER_ASSIGNED") {
                    await setStatus("RIDER_ASSIGNED");
                  }
                }}
              >
                {t("admin.order.assignRider")}
              </Button>

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
