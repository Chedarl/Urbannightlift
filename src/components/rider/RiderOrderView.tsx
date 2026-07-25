"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Camera, ShieldAlert, AlertTriangle, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildWaLink } from "@/lib/whatsapp/links";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { RiderLocationShare } from "@/components/rider/RiderLocationShare";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { formatXaf, normalizePhone } from "@/lib/utils";
import type { IncidentType, OrderStatus, PaymentStatus, ServiceType } from "@prisma/client";

export interface RiderOrderData {
  id: string;
  orderCode: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  serviceType: ServiceType;
  customerName: string;
  customerWhatsapp: string;
  pickupLocation: string;
  pickupLandmark: string | null;
  deliveryLocation: string;
  deliveryLandmark: string | null;
  itemDescription: string;
  quantity: number;
  declaredValueXaf: number;
  merchantName: string | null;
  merchantWhatsapp: string | null;
  specialInstructions: string | null;
  riderPaysAtPickup: boolean;
  safetyNotes: string | null;
  hasPickupProof: boolean;
  hasDeliveryProof: boolean;
  /** Set when dispatch offered this job; null until the rider answers. */
  assignedAt: string | null;
  riderAcceptedAt: string | null;
  /** What the rider earns on this delivery, once it is known. */
  riderPayoutXaf: number | null;
  estimatedPayoutXaf: number | null;
}

// The rider's sequential step buttons, each enabled only at the right status.
const STEP_FOR_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; labelKey: string }>> = {
  RIDER_ASSIGNED: { next: "RIDER_GOING_TO_PICKUP", labelKey: "goingToPickup" },
  RIDER_GOING_TO_PICKUP: { next: "RIDER_ARRIVED_AT_PICKUP", labelKey: "arrivedPickup" },
  RIDER_ARRIVED_AT_PICKUP: { next: "ITEM_COLLECTED", labelKey: "itemCollected" },
  ITEM_COLLECTED: { next: "RIDER_GOING_TO_DELIVERY", labelKey: "goingToDelivery" },
  RIDER_GOING_TO_DELIVERY: { next: "RIDER_ARRIVED_AT_DELIVERY", labelKey: "arrivedDelivery" },
};

const ISSUE_TYPES: { type: IncidentType; key: string }[] = [
  { type: "CUSTOMER_UNREACHABLE", key: "CUSTOMER_UNREACHABLE" },
  { type: "MERCHANT_ISSUE", key: "MERCHANT_ISSUE" },
  { type: "WRONG_ADDRESS", key: "WRONG_ADDRESS" },
  { type: "SAFETY_CONCERN", key: "SAFETY_CONCERN" },
  { type: "RIDER_ISSUE", key: "RIDER_ISSUE" },
  { type: "PAYMENT_ISSUE", key: "PAYMENT_ISSUE" },
  { type: "MISSING_ITEM", key: "MISSING_ITEM" },
  { type: "DAMAGED_ITEM", key: "DAMAGED_ITEM" },
  { type: "LATE_DELIVERY", key: "LATE_DELIVERY" },
  { type: "CUSTOMER_COMPLAINT", key: "CUSTOMER_COMPLAINT" },
];

const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";
const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

export function RiderOrderView({ order }: { order: RiderOrderData }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [uploading, setUploading] = useState<null | "PICKUP" | "DELIVERY">(null);
  const [showIssue, setShowIssue] = useState(false);
  const [issueType, setIssueType] = useState<IncidentType>("CUSTOMER_UNREACHABLE");
  const [issueDesc, setIssueDesc] = useState("");

  const step = STEP_FOR_STATUS[order.orderStatus];
  const atDelivery = order.orderStatus === "RIDER_ARRIVED_AT_DELIVERY";
  const readyToComplete = atDelivery && order.hasDeliveryProof;
  // The actual figure once delivered, the estimate before that.
  const payout = order.riderPayoutXaf ?? order.estimatedPayoutXaf;

  /** Accepts or declines the job dispatch offered. */
  async function answerAssignment(accept: boolean, reason?: string) {
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/assignment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept, reason }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t("common.error"));
      return;
    }
    if (accept) router.refresh();
    else router.push("/rider/dashboard");
  }

  async function setStatus(next: OrderStatus) {
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? t("common.error"));
      return;
    }
    startTransition(() => router.refresh());
  }

  async function submitProof(stage: "PICKUP" | "DELIVERY", payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, ...payload }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error === "OTP mismatch" ? t("rider.order.otpWrong") : d.error ?? t("common.error"));
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function uploadPhoto(stage: "PICKUP" | "DELIVERY", file: File) {
    setUploading(stage);
    try {
      const initRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "delivery-proofs", fileName: file.name, orderCode: order.orderCode }),
      });
      if (!initRes.ok) throw new Error();
      const { signedUrl, path } = await initRes.json();
      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      await submitProof(stage, { photoUrl: path });
    } catch {
      setError(t("common.error"));
    } finally {
      setUploading(null);
    }
  }

  async function reportIssue() {
    setError(null);
    const res = await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, incidentType: issueType, description: issueDesc }),
    });
    if (res.ok) {
      setShowIssue(false);
      setIssueDesc("");
      startTransition(() => router.refresh());
    } else {
      setError(t("common.error"));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-gold-400">{order.orderCode}</h1>
        <div className="flex gap-1.5">
          <OrderStatusBadge status={order.orderStatus} />
        </div>
      </div>

      {error && <p className="rounded-xl bg-restricted/10 px-3 py-2 text-sm text-restricted">{error}</p>}

      {/* The assignment handshake. Dispatch cannot tell whether a rider has
          seen a job until they answer here, so nothing else on this screen
          matters until they do. */}
      {order.assignedAt && !order.riderAcceptedAt ? (
        <section className="rounded-2xl border border-gold-400/50 bg-gold-400/10 p-4">
          <h2 className="font-display text-base font-bold text-gold-200">You&apos;ve been offered this delivery</h2>
          <p className="mt-1 text-sm text-mist-300">
            Dispatch is waiting to hear from you. Accept it so they know you&apos;re on the way
            {payout != null ? `, or decline if you can't take it. You earn ${formatXaf(payout)} on this delivery.` : ", or decline if you can't take it."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => answerAssignment(true)}>
              <Check className="h-4 w-4" /> Accept delivery
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const why = prompt("Why can't you take this delivery?") ?? "";
                if (why.trim()) answerAssignment(false, why.trim());
              }}
            >
              Can&apos;t take it
            </Button>
          </div>
        </section>
      ) : null}

      {payout != null && (
        <p className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
          <span className="text-mist-500">Your earnings on this delivery: </span>
          <span className="font-semibold text-gold-300">{formatXaf(payout)}</span>
          {order.riderPayoutXaf == null && <span className="text-xs text-mist-500"> (estimated)</span>}
        </p>
      )}

      <RiderLocationShare orderId={order.id} />

      {order.safetyNotes && (
        <div className="flex items-start gap-2 rounded-xl border border-caution/40 bg-caution/10 p-3 text-xs text-caution">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">{t("rider.order.safetyNotes")}: </span>
            {order.safetyNotes}
          </span>
        </div>
      )}

      {/* Details */}
      <section className={card}>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-mist-500">{t("rider.order.customer")}</span>
          <span className="font-medium">{order.customerName}</span>
        </div>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-mist-500">{t("rider.order.payment")}</span>
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
        <a
          href={buildWaLink(normalizePhone(order.customerWhatsapp), `Urban Night Lift — ${order.orderCode}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-ink-950"
        >
          <MessageCircle className="h-4 w-4" /> {order.customerWhatsapp}
        </a>
      </section>

      <section className={card}>
        <p className="text-xs text-mist-500">{t("rider.order.pickup")}</p>
        <p className="font-medium">{order.pickupLocation}</p>
        {order.pickupLandmark && <p className="text-xs text-mist-500">{order.pickupLandmark}</p>}
        <hr className="my-3 border-ink-700" />
        <p className="text-xs text-mist-500">{t("rider.order.delivery")}</p>
        <p className="font-medium">{order.deliveryLocation}</p>
        {order.deliveryLandmark && <p className="text-xs text-mist-500">{order.deliveryLandmark}</p>}
      </section>

      <section className={card}>
        <p className="text-xs text-mist-500">{t("rider.order.item")}</p>
        <p className="font-medium">{order.itemDescription} × {order.quantity}</p>
        <p className="mt-1 text-xs text-mist-500">
          {t("rider.order.declaredValue")}: {formatXaf(order.declaredValueXaf)}
        </p>
        {order.riderPaysAtPickup && (
          <Badge tone="caution" className="mt-2">{t("orderForm.riderPaysAtPickup")}</Badge>
        )}
        {order.specialInstructions && (
          <p className="mt-2 rounded-lg bg-ink-800 p-2 text-xs">{order.specialInstructions}</p>
        )}
        {order.merchantName && (
          <a
            href={order.merchantWhatsapp ? buildWaLink(normalizePhone(order.merchantWhatsapp), order.orderCode) : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-2 text-xs text-violet-300"
          >
            <MessageCircle className="h-3.5 w-3.5" /> {order.merchantName}
          </a>
        )}
      </section>

      {/* Sequential status action */}
      <section className={card}>
        <div className="flex flex-col gap-2">
          {step && (
            <Button size="lg" disabled={pending} onClick={() => setStatus(step.next)}>
              {t(`rider.order.actions.${step.labelKey}`)}
            </Button>
          )}

          {/* Pickup proof (optional but available once collected) */}
          {["ITEM_COLLECTED", "RIDER_ARRIVED_AT_PICKUP"].includes(order.orderStatus) && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-4 py-2.5 text-sm">
              <Camera className="h-4 w-4" />
              {uploading === "PICKUP" ? t("orderForm.uploading") : t("rider.order.actions.uploadPickupProof")}
              {order.hasPickupProof && <Check className="h-4 w-4 text-safe" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto("PICKUP", e.target.files[0])}
              />
            </label>
          )}

          {/* Delivery proof: OTP + photo */}
          {atDelivery && (
            <div className="flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-800 p-3">
              <label className="text-xs text-mist-500">{t("rider.order.actions.enterOtp")}</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t("rider.order.otpPlaceholder")}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
                <Button size="sm" disabled={pending || otp.length < 4} onClick={() => submitProof("DELIVERY", { otpEntered: otp })}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-ink-700 bg-ink-950 px-4 py-2.5 text-sm">
                <Camera className="h-4 w-4" />
                {uploading === "DELIVERY" ? t("orderForm.uploading") : t("rider.order.actions.uploadDeliveryProof")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadPhoto("DELIVERY", e.target.files[0])}
                />
              </label>
              {order.hasDeliveryProof && (
                <p className="flex items-center gap-1 text-xs text-safe">
                  <Check className="h-3.5 w-3.5" /> {t("admin.order.proofs")}
                </p>
              )}
              {!order.hasDeliveryProof && <p className="text-xs text-caution">{t("rider.order.proofRequired")}</p>}
            </div>
          )}

          {atDelivery && (
            <Button size="lg" disabled={pending || !readyToComplete} onClick={() => setStatus("DELIVERED")}>
              <Check className="h-5 w-5" /> {t("rider.order.actions.completed")}
            </Button>
          )}

          <Button variant="danger" size="sm" onClick={() => setShowIssue((v) => !v)}>
            <AlertTriangle className="h-4 w-4" /> {t("rider.order.actions.reportIssue")}
          </Button>

          {showIssue && (
            <div className="flex flex-col gap-2 rounded-xl border border-restricted/30 bg-ink-800 p-3">
              <select className={inputCls} value={issueType} onChange={(e) => setIssueType(e.target.value as IncidentType)}>
                {ISSUE_TYPES.map(({ type, key }) => (
                  <option key={key} value={type}>
                    {t(`rider.order.issueTypes.${key}`)}
                  </option>
                ))}
              </select>
              <textarea
                className={inputCls}
                rows={2}
                placeholder={t("admin.incidents.description")}
                value={issueDesc}
                onChange={(e) => setIssueDesc(e.target.value)}
              />
              <Button size="sm" variant="danger" disabled={pending || !issueDesc} onClick={reportIssue}>
                {t("rider.order.actions.reportIssue")}
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
