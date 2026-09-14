"use client";

/**
 * Branded A4 "Order Review & Confirmation" PDF.
 *
 * Built with @react-pdf/renderer via a dynamic import so the library never runs
 * during SSR / build — only in the browser, on demand. Uses React.createElement
 * (not JSX) so the react-pdf primitives stay local to the dynamic import.
 *
 * SECURITY: never embeds the uploaded prescription or parcel photo. The document
 * only states that such images are provided securely at pickup.
 */
import { createElement as h, type ComponentProps, type ReactNode } from "react";
import { groupXaf } from "@/lib/utils";
import { pdfSafe } from "@/lib/pdf/safeText";


export interface OrderPdfData {
  orderCode: string; // real code, or "PENDING" pre-submit
  createdAt: Date;
  locale: "en" | "fr";
  customerName: string;
  customerWhatsapp: string;
  serviceLabel: string;
  itemDescription: string;
  serviceDetails?: Record<string, unknown> | null;
  quantity: number;
  declaredValueXaf: number;
  pickupLocation: string;
  pickupZoneName?: string;
  deliveryLocation: string;
  deliveryZoneName?: string;
  estimatedFeeXaf: number | null;
  paymentMethodLabel: string;
  legalNotice: string;
}

const xaf = (n: number) => `${groupXaf(n)} XAF`;

/** Flatten the structured serviceDetails into printable "label: value" rows. */
function detailRows(data: OrderPdfData): [string, string][] {
  const sd = data.serviceDetails ?? {};
  const fr = data.locale === "fr";
  const rows: [string, string][] = [];
  const list = (arr: unknown, fmt: (o: Record<string, unknown>) => string) =>
    Array.isArray(arr) ? arr.filter(Boolean).map((o) => fmt(o as Record<string, unknown>)).filter(Boolean).join("\n") : "";

  // Accept both key spellings the forms and this reader use, so nothing silently
  // disappears from the customer's PDF (and older orders still render).
  const foods = list(sd.foodItems ?? sd.items, (o) => (o.name ? `• ${o.qty || 1}× ${o.name}${o.notes ? ` — ${o.notes}` : ""}` : ""));
  if (foods) rows.push([fr ? "Plats" : "Dishes", foods]);
  const meds = list(sd.meds, (o) => (o.name ? `• ${o.qty || 1}× ${o.name}${o.dosage ? ` (${o.dosage})` : ""}` : ""));
  if (meds) rows.push([fr ? "Médicaments" : "Medicines", meds]);
  const grocery = list(sd.groceryItems, (o) => (o.name ? `• ${o.qty || 1}× ${o.name}${o.brand ? ` — ${o.brand}` : ""}` : ""));
  if (grocery) rows.push([fr ? "Articles" : "Items", grocery]);

  const place = sd.place ?? sd.vendorName;
  if (place) rows.push([fr ? "Lieu" : "Place", String(place)]);
  if (sd.pharmacy) rows.push([fr ? "Pharmacie" : "Pharmacy", String(sd.pharmacy)]);
  const store = sd.store ?? sd.storeName;
  if (store) rows.push([fr ? "Magasin" : "Store", String(store)]);
  if (sd.title) rows.push([fr ? "Demande" : "Request", String(sd.title)]);
  if (sd.category) rows.push([fr ? "Catégorie" : "Category", String(sd.category)]);
  if (sd.budgetXaf) rows.push([fr ? "Budget" : "Budget", xaf(Number(sd.budgetXaf) || 0)]);
  if (sd.size) rows.push([fr ? "Taille" : "Size", String(sd.size)]);
  if (sd.weight) rows.push([fr ? "Poids" : "Weight", String(sd.weight)]);
  if (sd.senderName || sd.senderPhone) rows.push([fr ? "Expéditeur" : "Sender", `${sd.senderName || ""} ${sd.senderPhone || ""}`.trim()]);
  const recipientName = sd.recipientName ?? sd.receiverName;
  const recipientPhone = sd.recipientPhone ?? sd.receiverPhone;
  if (recipientName || recipientPhone) rows.push([fr ? "Destinataire" : "Recipient", `${recipientName || ""} ${recipientPhone || ""}`.trim()]);
  if (sd.accessNotes) rows.push([fr ? "Accès" : "Access notes", String(sd.accessNotes)]);
  if (sd.deadline) rows.push([fr ? "Échéance" : "Deadline", String(sd.deadline)]);
  if (sd.reason) rows.push([fr ? "Raison" : "Reason", String(sd.reason)]);
  if (sd.counterRef) rows.push([fr ? "Réf. comptoir" : "Counter ref", String(sd.counterRef)]);
  if (sd.patientNote) rows.push([fr ? "Note patient" : "Patient note", String(sd.patientNote)]);
  return rows;
}

/** Generate the PDF blob in the browser. Returns a Blob for download/share. */
export async function generateOrderPdfBlob(data: OrderPdfData): Promise<Blob> {
  const RP = await import("@react-pdf/renderer");
  const { Document, Page, View, Text, Image, StyleSheet, pdf } = RP;

  /**
   * Every string drawn in this document passes through `pdfSafe` first.
   *
   * Applied at the one primitive that draws text, rather than at the fifteen
   * fields that supply it — a field added later is covered without anybody
   * remembering this exists, which is the only version of this that stays true.
   *
   * `Helvetica` is a PDF base font restricted to WinAnsiEncoding, and a
   * character it lacks is not dropped or replaced with a placeholder — it is
   * drawn as a *different* character. Rendered and read back, "Ngonnso' Ɛtaŋ
   * Ɔbi" came out as "Ngonnso' taK bi" and a 🙏 in a delivery note as "=O".
   * A wrong letter in a customer's name is worse than a missing one, because it
   * looks correct. See `src/lib/pdf/safeText.ts`.
   */
  const SafeText = (props: ComponentProps<typeof Text>, ...children: ReactNode[]) =>
    h(Text, props, ...children.map((c) => (typeof c === "string" ? pdfSafe(c) : c)));
  const fr = data.locale === "fr";

  const s = StyleSheet.create({
    page: { padding: 34, fontSize: 10, color: "#1a1523", fontFamily: "Helvetica", backgroundColor: "#ffffff" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#7b2cbf", paddingBottom: 10, marginBottom: 12 },
    brandRow: { flexDirection: "row", alignItems: "center" },
    logo: { width: 40, height: 40, marginRight: 10 },
    brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#4a1d78" },
    sub: { fontSize: 9, color: "#6b6480" },
    badge: { backgroundColor: "#fff4d6", borderWidth: 1, borderColor: "#d4af37", color: "#8a6d00", fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, textAlign: "center", marginBottom: 14 },
    docTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
    codeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    code: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#4a1d78", letterSpacing: 2 },
    sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#7b2cbf", textTransform: "uppercase", letterSpacing: 1, marginTop: 10, marginBottom: 4 },
    row: { flexDirection: "row", paddingVertical: 2 },
    label: { width: 120, color: "#6b6480" },
    value: { flex: 1, fontFamily: "Helvetica-Bold" },
    feeBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f6f2fb", borderRadius: 6, padding: 10, marginTop: 10 },
    feeLabel: { fontSize: 10, color: "#6b6480" },
    fee: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#4a1d78" },
    legal: { marginTop: 16, borderTopWidth: 1, borderTopColor: "#e6e0ef", paddingTop: 8, fontSize: 7.5, color: "#8a8398", lineHeight: 1.4 },
    note: { marginTop: 8, fontSize: 7.5, color: "#8a8398" },
  });

  const Row = (label: string, value: string) =>
    h(View, { style: s.row, key: label }, SafeText( { style: s.label }, label), SafeText( { style: s.value }, value || "—"));

  const logoSrc = typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png";

  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: s.page },
      // Header
      h(
        View,
        { style: s.header },
        h(
          View,
          { style: s.brandRow },
          h(Image, { src: logoSrc, style: s.logo }),
          h(
            View,
            null,
            SafeText( { style: s.brand }, "URBAN NIGHT LIFT"),
            SafeText( { style: s.sub }, fr ? "Livraison de nuit · Yaoundé · 18h–4h" : "Night delivery · Yaoundé · 6PM–4AM")
          )
        ),
        SafeText( { style: s.sub }, data.createdAt.toLocaleString(fr ? "fr-FR" : "en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))
      ),
      SafeText( { style: s.docTitle }, fr ? "Récapitulatif & Confirmation de commande" : "Order Review & Confirmation"),
      SafeText( { style: s.badge }, fr ? "EN ATTENTE DE CONFIRMATION ET DE PAIEMENT" : "PENDING CONFIRMATION AND PAYMENT"),
      // Code
      h(
        View,
        { style: s.codeRow },
        SafeText( { style: s.code }, data.orderCode),
        SafeText( { style: s.sub }, fr ? "Conservez ce code" : "Keep this code")
      ),
      // Customer
      SafeText( { style: s.sectionTitle }, fr ? "Client" : "Customer"),
      Row(fr ? "Nom" : "Name", data.customerName),
      Row("WhatsApp", data.customerWhatsapp),
      Row(fr ? "Langue" : "Language", fr ? "Français" : "English"),
      // Service
      SafeText( { style: s.sectionTitle }, fr ? "Service" : "Service"),
      Row(fr ? "Type" : "Type", data.serviceLabel),
      Row(fr ? "Description" : "Description", data.itemDescription),
      ...detailRows(data).map(([l, v]) => Row(l, v)),
      Row(fr ? "Quantité" : "Quantity", String(data.quantity)),
      Row(fr ? "Valeur déclarée" : "Declared value", xaf(data.declaredValueXaf)),
      // Locations
      SafeText( { style: s.sectionTitle }, fr ? "Lieux" : "Locations"),
      Row(fr ? "Ramassage" : "Pickup", `${data.pickupLocation}${data.pickupZoneName ? ` (${data.pickupZoneName})` : ""}`),
      Row(fr ? "Livraison" : "Delivery", `${data.deliveryLocation}${data.deliveryZoneName ? ` (${data.deliveryZoneName})` : ""}`),
      // Fee
      h(
        View,
        { style: s.feeBox },
        SafeText( { style: s.feeLabel }, fr ? "Frais de livraison estimés" : "Estimated delivery fee"),
        SafeText( { style: s.fee }, data.estimatedFeeXaf != null ? xaf(data.estimatedFeeXaf) : "—")
      ),
      // Payment
      SafeText( { style: s.sectionTitle }, fr ? "Paiement" : "Payment"),
      Row(fr ? "Méthode" : "Method", data.paymentMethodLabel),
      Row(fr ? "Statut" : "Status", fr ? "En attente de vérification" : "Pending verification"),
      // Security note
      SafeText( { style: s.note }, fr
        ? "Toute ordonnance ou photo de colis est transmise de manière sécurisée au ramassage et n'est pas incluse dans ce document."
        : "Any prescription or parcel photo is provided securely at pickup and is not included in this document."),
      // Legal
      SafeText( { style: s.legal }, data.legalNotice)
    )
  );

  return pdf(doc).toBlob();
}
