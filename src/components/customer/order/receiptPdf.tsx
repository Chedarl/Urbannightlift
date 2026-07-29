"use client";

/**
 * The receipt: proof that the customer paid, and proof that we delivered.
 *
 * This is a different document from the order review. That one is a request
 * stamped "pending confirmation and payment"; this is issued only after money
 * has been verified and the goods have actually been received, and it says so
 * with the evidence attached — the payment reference, the delivery time, and
 * how the customer confirmed receipt.
 *
 * It exists because in a cash-and-mobile-money market, a customer with no
 * receipt has no recourse and no reason to trust a night delivery service the
 * second time.
 *
 * Built with @react-pdf/renderer via a dynamic import so the library never
 * runs during SSR or build, using React.createElement so the primitives stay
 * inside the dynamic import.
 *
 * SECURITY: the signature or handover photo is deliberately NOT embedded. It
 * is private evidence held against the order, not something to hand around in
 * a shareable file.
 */
import { createElement as h } from "react";

export interface ReceiptPdfData {
  orderCode: string;
  /**
   * DISPATCH is issued when the money is confirmed and a rider goes out; it
   * carries the delivery code. DELIVERED is issued once the customer has
   * confirmed receipt and closes the transaction.
   */
  stage: "DISPATCH" | "DELIVERED";
  /** Sequential-looking document reference, for the customer's own records. */
  receiptNumber: string;
  /** Shown only on the dispatch receipt, and only to the order's owner. */
  otpCode: string | null;
  locale: "en" | "fr";
  issuedAt: Date;
  customerName: string;
  customerWhatsapp: string;
  serviceLabel: string;
  itemDescription: string;
  pickupLocation: string;
  deliveryLocation: string;
  /** What the customer actually paid for delivery. */
  amountPaidXaf: number | null;
  paymentMethodLabel: string;
  paymentReference: string | null;
  paymentVerified: boolean;
  paymentVerifiedAt: Date | null;
  deliveredAt: Date | null;
  /** CODE | SIGNATURE | PHOTO */
  confirmMethod: string | null;
  confirmedAt: Date | null;
  riderName: string | null;
  legalNotice: string;
}

const xaf = (n: number) => `${n.toLocaleString("fr-FR")} XAF`;

function methodLabel(method: string | null, fr: boolean): string {
  if (method === "SIGNATURE") return fr ? "Signature du client" : "Customer signature";
  if (method === "PHOTO") return fr ? "Photo de la remise" : "Handover photo";
  if (method === "CODE") return fr ? "Code de livraison saisi par le client" : "Delivery code entered by the customer";
  return fr ? "Non confirmé" : "Not confirmed";
}

/** Generate the receipt in the browser. Returns a Blob for download or sharing. */
export async function generateReceiptPdfBlob(data: ReceiptPdfData): Promise<Blob> {
  const RP = await import("@react-pdf/renderer");
  const { Document, Page, View, Text, Image, StyleSheet, pdf } = RP;
  const fr = data.locale === "fr";

  const s = StyleSheet.create({
    page: { padding: 34, fontSize: 10, color: "#1a1523", fontFamily: "Helvetica", backgroundColor: "#ffffff" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 2,
      borderBottomColor: "#7b2cbf",
      paddingBottom: 10,
      marginBottom: 12,
    },
    brandRow: { flexDirection: "row", alignItems: "center" },
    logo: { width: 40, height: 40, marginRight: 10 },
    brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#4a1d78" },
    sub: { fontSize: 9, color: "#6b6480" },
    docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 6 },
    paidBadge: {
      backgroundColor: "#e7f8ee",
      borderWidth: 1,
      borderColor: "#1f9d55",
      color: "#116336",
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: 4,
      textAlign: "center",
      marginBottom: 14,
    },
    dueBadge: {
      backgroundColor: "#fff4d6",
      borderWidth: 1,
      borderColor: "#d4af37",
      color: "#8a6d00",
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: 4,
      textAlign: "center",
      marginBottom: 14,
    },
    codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    otpBox: {
      marginTop: 4,
      backgroundColor: "#f6f2ff",
      borderWidth: 1,
      borderColor: "#c8b6ff",
      borderRadius: 6,
      paddingVertical: 12,
      alignItems: "center",
    },
    otp: { fontSize: 30, fontFamily: "Helvetica-Bold", letterSpacing: 10, color: "#4a1d78" },
    issuer: { marginTop: 10, fontSize: 7.5, color: "#6b6480", textAlign: "center" },
    code: { fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: "#4a1d78" },
    sectionTitle: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#4a1d78",
      marginTop: 12,
      marginBottom: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#e5e0ee",
      paddingBottom: 3,
    },
    row: { flexDirection: "row", marginBottom: 3 },
    label: { width: 150, color: "#6b6480" },
    value: { flex: 1 },
    totalBox: {
      marginTop: 14,
      backgroundColor: "#f6f2ff",
      borderWidth: 1,
      borderColor: "#c8b6ff",
      borderRadius: 6,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#4a1d78" },
    total: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#1a1523" },
    note: { marginTop: 14, fontSize: 8, color: "#6b6480", lineHeight: 1.4 },
    legal: { marginTop: 8, fontSize: 7, color: "#8a84a0", lineHeight: 1.4 },
  });

  const Row = (label: string, value: string) =>
    h(View, { style: s.row }, h(Text, { style: s.label }, label), h(Text, { style: s.value }, value));

  const dt = (d: Date | null) =>
    d
      ? d.toLocaleString(fr ? "fr-FR" : "en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const logoSrc = typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png";

  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: s.page },
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
            h(Text, { style: s.brand }, "URBAN NIGHT LIFT"),
            h(
              Text,
              { style: s.sub },
              fr ? "Livraison de nuit · Yaoundé · 18h–4h" : "Night delivery · Yaoundé · 6PM–4AM"
            )
          )
        ),
        h(Text, { style: s.sub }, dt(data.issuedAt))
      ),

      h(
        Text,
        { style: s.docTitle },
        data.stage === "DISPATCH"
          ? fr ? "Reçu de paiement" : "Payment receipt"
          : fr ? "Reçu de livraison" : "Delivery receipt"
      ),
      h(
        Text,
        { style: data.paymentVerified ? s.paidBadge : s.dueBadge },
        data.stage === "DISPATCH"
          ? data.paymentVerified
            ? fr ? "PAYÉ — LIVREUR EN ROUTE" : "PAID — RIDER DISPATCHED"
            : fr ? "À RÉGLER À LA LIVRAISON" : "PAYABLE ON DELIVERY"
          : data.paymentVerified
            ? fr ? "PAYÉ ET LIVRÉ" : "PAID AND DELIVERED"
            : fr ? "LIVRÉ — PAIEMENT NON ENCORE VÉRIFIÉ" : "DELIVERED — PAYMENT NOT YET VERIFIED"
      ),
      h(Text, { style: s.sub }, `${fr ? "Reçu n°" : "Receipt no."} ${data.receiptNumber}`),

      h(
        View,
        { style: s.codeRow },
        h(Text, { style: s.code }, data.orderCode),
        h(Text, { style: s.sub }, fr ? "Référence de commande" : "Order reference")
      ),

      h(Text, { style: s.sectionTitle }, fr ? "Client" : "Customer"),
      Row(fr ? "Nom" : "Name", data.customerName),
      Row("WhatsApp", data.customerWhatsapp),

      h(Text, { style: s.sectionTitle }, fr ? "Service rendu" : "Service provided"),
      Row(fr ? "Type" : "Type", data.serviceLabel),
      Row(fr ? "Description" : "Description", data.itemDescription),
      Row(fr ? "Ramassage" : "Pickup", data.pickupLocation),
      Row(fr ? "Livraison" : "Delivery", data.deliveryLocation),
      ...(data.riderName ? [Row(fr ? "Livreur" : "Rider", data.riderName)] : []),

      h(Text, { style: s.sectionTitle }, fr ? "Preuve de paiement" : "Proof of payment"),
      Row(fr ? "Méthode" : "Method", data.paymentMethodLabel),
      Row(
        fr ? "Statut" : "Status",
        data.paymentVerified
          ? fr
            ? "Vérifié par Urban Night Lift"
            : "Verified by Urban Night Lift"
          : fr
            ? "En attente de vérification"
            : "Pending verification"
      ),
      ...(data.paymentReference ? [Row(fr ? "Référence" : "Reference", data.paymentReference)] : []),
      ...(data.paymentVerifiedAt ? [Row(fr ? "Vérifié le" : "Verified on", dt(data.paymentVerifiedAt))] : []),

      ...(data.stage === "DISPATCH"
        ? data.otpCode
          ? [
              h(Text, { style: s.sectionTitle }, fr ? "Votre code de livraison" : "Your delivery code"),
              h(View, { style: s.otpBox }, h(Text, { style: s.otp }, data.otpCode)),
              h(
                Text,
                { style: s.note },
                fr
                  ? "Donnez ce code au livreur uniquement lorsque vous avez reçu votre commande. Il confirme la remise et clôture la livraison."
                  : "Give this code to the rider only once you have your order in hand. It confirms the handover and closes the delivery."
              ),
            ]
          : []
        : [
            h(Text, { style: s.sectionTitle }, fr ? "Preuve de livraison" : "Proof of delivery"),
            Row(fr ? "Livré le" : "Delivered on", dt(data.deliveredAt)),
            Row(fr ? "Confirmé par" : "Confirmed by", methodLabel(data.confirmMethod, fr)),
            Row(fr ? "Confirmé le" : "Confirmed on", dt(data.confirmedAt)),
          ]),

      h(
        View,
        { style: s.totalBox },
        h(
          Text,
          { style: s.totalLabel },
          data.stage === "DISPATCH" && !data.paymentVerified
            ? fr ? "Montant à payer" : "Amount due"
            : fr ? "Montant payé" : "Amount paid"
        ),
        h(Text, { style: s.total }, data.amountPaidXaf != null ? xaf(data.amountPaidXaf) : "—")
      ),

      h(
        Text,
        { style: s.note },
        data.stage === "DISPATCH"
          ? fr
            ? "Ce reçu atteste du paiement des frais de livraison ci-dessus et de l'envoi d'un livreur. Le reçu final vous sera délivré après confirmation de la réception."
            : "This receipt confirms payment of the delivery fee above and that a rider has been dispatched. A final receipt is issued once you confirm you have received your order."
          : fr
            ? "Ce reçu atteste que le service ci-dessus a été rendu et confirmé par le client. Toute signature ou photo de remise est conservée de manière privée avec la commande et n'est pas jointe à ce document."
            : "This receipt certifies that the service above was provided and confirmed by the customer. Any signature or handover photo is held privately against the order and is not attached to this document."
      ),
      h(
        Text,
        { style: s.issuer },
        fr
          ? "Émis par Urban Night Lift · urbannighlift.com · urbannighlift@gmail.com · +237 680 038 004"
          : "Issued by Urban Night Lift · urbannighlift.com · urbannighlift@gmail.com · +237 680 038 004"
      ),
      h(Text, { style: s.legal }, data.legalNotice)
    )
  );

  return pdf(doc).toBlob();
}
