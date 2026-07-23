/**
 * Builds the exact WhatsApp order message from the business spec.
 * Pure function — reusable client- and server-side. It never receives any
 * payment credential (no such field exists anywhere in the data model).
 */
import { getLegalNotice } from "@/lib/i18n/legal";
import type { Locale } from "@/lib/i18n";

export interface OrderMessageInput {
  orderCode: string;
  createdAt: Date | string;
  customerName: string;
  customerWhatsapp: string;
  language: Locale;
  serviceTypeLabel: string;
  itemDescription: string;
  quantity: number;
  declaredValueXaf: number;
  isFragile: boolean;
  isMedicine: boolean;
  prescriptionRequired: "YES" | "NO" | "NOT_SURE" | null;
  pickupLocation: string;
  pickupLandmark?: string | null;
  deliveryLocation: string;
  deliveryLandmark?: string | null;
  paymentMethodLabel: string;
  paymentPhone?: string | null;
  transactionReference?: string | null;
  specialInstructions?: string | null;
}

function yesNo(value: boolean, locale: Locale): string {
  if (locale === "fr") return value ? "OUI" : "NON";
  return value ? "YES" : "NO";
}

function prescriptionLabel(value: OrderMessageInput["prescriptionRequired"], locale: Locale): string {
  switch (value) {
    case "YES":
      return locale === "fr" ? "OUI" : "YES";
    case "NO":
      return locale === "fr" ? "NON" : "NO";
    case "NOT_SURE":
      return locale === "fr" ? "PAS SÛR" : "NOT SURE";
    default:
      return "—";
  }
}

export function buildOrderMessage(order: OrderMessageInput): string {
  const locale = order.language;
  const date =
    typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt;
  const dateTime = date.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    "NEW URBAN NIGHT LIFT ORDER",
    "",
    `Order ID: ${order.orderCode}`,
    `Date/Time: ${dateTime}`,
    `Customer Name: ${order.customerName}`,
    `WhatsApp: ${order.customerWhatsapp}`,
    `Language: ${locale === "fr" ? "Français" : "English"}`,
    "",
    "SERVICE DETAILS",
    `Service Type: ${order.serviceTypeLabel}`,
    `Item Description: ${order.itemDescription}`,
    `Quantity: ${order.quantity}`,
    `Declared Value: ${order.declaredValueXaf.toLocaleString("fr-FR")} XAF`,
    `Fragile: ${yesNo(order.isFragile, locale)}`,
    `Medicine: ${yesNo(order.isMedicine, locale)}`,
    `Prescription Required: ${prescriptionLabel(order.prescriptionRequired, locale)}`,
    "",
    "LOCATIONS",
    `Pickup: ${order.pickupLocation}`,
    `Pickup Landmark: ${order.pickupLandmark || "—"}`,
    `Delivery: ${order.deliveryLocation}`,
    `Delivery Landmark: ${order.deliveryLandmark || "—"}`,
    "",
    "PAYMENT",
    `Payment Method: ${order.paymentMethodLabel}`,
    "Payment Status: Pending verification",
    `Payment Phone: ${order.paymentPhone || "—"}`,
    `Transaction Reference: ${order.transactionReference || "—"}`,
    "",
    "SPECIAL INSTRUCTIONS",
    order.specialInstructions?.trim() || "—",
    "",
    "LEGAL NOTICE",
    getLegalNotice(locale),
  ];

  return lines.join("\n");
}
