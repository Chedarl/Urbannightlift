import { Badge } from "@/components/shared/Badge";
import { formatDetailedStatus } from "@/lib/orders/statusLabels";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

const ORDER_TONE: Partial<Record<OrderStatus, "gold" | "violet" | "safe" | "caution" | "restricted" | "muted">> = {
  NEW_REQUEST: "violet",
  AWAITING_DISPATCHER_REVIEW: "caution",
  APPROVED: "violet",
  AWAITING_PAYMENT: "caution",
  PAYMENT_SUBMITTED: "caution",
  PAYMENT_VERIFIED: "violet",
  RIDER_ASSIGNED: "violet",
  DELIVERED: "safe",
  CLOSED: "safe",
  REJECTED: "restricted",
  CANCELLED_BY_CUSTOMER: "restricted",
  CANCELLED_BY_UNL: "restricted",
  FAILED_DELIVERY: "restricted",
  SAFETY_HOLD: "restricted",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONE[status] ?? "gold"}>{formatDetailedStatus(status)}</Badge>;
}

const PAYMENT_TONE: Record<PaymentStatus, "gold" | "violet" | "safe" | "caution" | "restricted" | "muted"> = {
  PENDING: "muted",
  AWAITING_CUSTOMER_PAYMENT: "caution",
  SUBMITTED_UNVERIFIED: "caution",
  VERIFIED: "safe",
  FAILED: "restricted",
  REFUNDED: "muted",
  CANCELLED: "restricted",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONE[status]}>{formatDetailedStatus(status)}</Badge>;
}
