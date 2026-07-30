"use client";

/**
 * The receipt: proof of what was bought, what we charged, and what was paid.
 *
 * Rebuilt around a real line-item table rather than a column of label/value
 * rows, because the document has one job the old layout could not do — show a
 * customer, at a glance, that we charged them what the shop charged plus a fee
 * we told them about in advance. A receipt that blends those into a single
 * figure is indistinguishable, to the person reading it, from one that hides a
 * markup.
 *
 * So the arithmetic is laid out the way Square lays out a receipt: items with
 * amounts, a goods subtotal, our delivery fee named as ours, a ruled total.
 * Near-monochrome and quiet — a receipt is read for its numbers, not admired,
 * and our neon belongs on the app rather than on the thing somebody files.
 *
 * The line that matters most is the one after the total: when the shop charged
 * less than the customer's cap, it says so. Telling someone we charged less
 * than we were allowed to is the most persuasive sentence available, and it
 * costs nothing.
 *
 * Built with @react-pdf/renderer via a dynamic import so the library never runs
 * during SSR or build, using React.createElement so the primitives stay inside
 * the dynamic import.
 *
 * SECURITY, unchanged: the signature, handover photo, prescription and the
 * shop-receipt photo are deliberately NOT embedded. They are private evidence
 * held against the order, not something to hand around in a shareable file.
 */
import { createElement as h } from "react";

export interface ReceiptLineItem {
  name: string;
  qty?: number;
}

export interface ReceiptPdfData {
  orderCode: string;
  /**
   * DISPATCH is issued when the money is confirmed and a rider goes out; it
   * carries the delivery code. DELIVERED is issued once the customer has
   * confirmed receipt and closes the transaction.
   */
  stage: "DISPATCH" | "DELIVERED";
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

  /** True when we bought things for the customer on this order. */
  shopping?: boolean;
  /** What they asked us to buy, for the itemised lines. */
  lineItems?: ReceiptLineItem[];
  /** What the shop charged. Null when nothing was bought. */
  goodsXaf?: number | null;
  /** The ceiling they agreed to, so we can show what they saved. */
  goodsCapXaf?: number | null;
  /** Our fee — the only thing we earn on. */
  deliveryFeeXaf: number | null;
  /** Goods + fee. */
  totalXaf: number | null;
  /** What has actually been paid so far. */
  amountPaidXaf: number | null;
  /** On mobile money the goods are settled in cash at the door. */
  goodsDueAtDoorXaf?: number | null;
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

  const INK = "#1a1523";
  const MUTED = "#6b6480";
  const LINE = "#e3e0ea";

  const s = StyleSheet.create({
    page: { paddingHorizontal: 44, paddingVertical: 40, fontSize: 9.5, color: INK, fontFamily: "Helvetica", backgroundColor: "#ffffff" },

    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 },
    logo: { width: 34, height: 34, marginBottom: 6 },
    brand: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
    brandSub: { fontSize: 8, color: MUTED, marginTop: 2 },
    docType: { fontSize: 8, color: MUTED, textAlign: "right", letterSpacing: 1 },
    docNo: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 3 },
    docDate: { fontSize: 8, color: MUTED, textAlign: "right", marginTop: 2 },

    status: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 18 },

    // The money table — the reason this document exists.
    itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    itemName: { flex: 1, paddingRight: 16 },
    amount: { width: 96, textAlign: "right" },
    amountBold: { width: 96, textAlign: "right", fontFamily: "Helvetica-Bold" },
    rule: { borderBottomWidth: 0.7, borderBottomColor: LINE, marginVertical: 7 },
    ruleStrong: { borderBottomWidth: 1.4, borderBottomColor: INK, marginVertical: 8 },
    totalLabel: { flex: 1, fontSize: 12, fontFamily: "Helvetica-Bold" },
    totalAmount: { width: 96, textAlign: "right", fontSize: 12, fontFamily: "Helvetica-Bold" },

    saved: { marginTop: 8, fontSize: 8.5, color: "#116336", lineHeight: 1.4 },
    dueNote: { marginTop: 8, fontSize: 8.5, color: MUTED, lineHeight: 1.4 },

    sectionLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1, marginTop: 22, marginBottom: 6 },
    kv: { flexDirection: "row", paddingVertical: 2 },
    k: { width: 130, color: MUTED },
    v: { flex: 1 },

    otpBox: { marginTop: 18, borderWidth: 1, borderColor: LINE, paddingVertical: 14, alignItems: "center" },
    otpLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 1 },
    otp: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 9, marginTop: 5 },

    promise: { marginTop: 22, paddingTop: 12, borderTopWidth: 0.7, borderTopColor: LINE, fontSize: 8, color: MUTED, lineHeight: 1.5 },
    legal: { marginTop: 8, fontSize: 7, color: "#8a84a0", lineHeight: 1.4 },
    foot: { marginTop: 14, fontSize: 7.5, color: MUTED, textAlign: "center", lineHeight: 1.5 },
  });

  const dt = (d: Date | null) =>
    d
      ? d.toLocaleString(fr ? "fr-FR" : "en-GB", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        })
      : "—";

  const kv = (k: string, v: string) => h(View, { style: s.kv }, h(Text, { style: s.k }, k), h(Text, { style: s.v }, v));

  const money = (label: string, value: string, bold = false) =>
    h(
      View,
      { style: s.itemRow },
      h(Text, { style: s.itemName }, label),
      h(Text, { style: bold ? s.amountBold : s.amount }, value)
    );

  const logoSrc = typeof window !== "undefined" ? `${window.location.origin}/logo.png` : "/logo.png";
  const delivered = data.stage === "DELIVERED";
  const goods = data.goodsXaf ?? 0;
  const fee = data.deliveryFeeXaf ?? 0;
  const total = data.totalXaf ?? goods + fee;
  const saved = data.shopping && data.goodsCapXaf != null && data.goodsCapXaf > goods ? data.goodsCapXaf - goods : 0;

  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: s.page },

      // ── Header
      h(
        View,
        { style: s.head },
        h(
          View,
          null,
          h(Image, { src: logoSrc, style: s.logo }),
          h(Text, { style: s.brand }, "URBAN NIGHT LIFT"),
          h(Text, { style: s.brandSub }, fr ? "Livraison de nuit · Yaoundé · 18h–4h" : "Night delivery · Yaoundé · 6PM–4AM")
        ),
        h(
          View,
          null,
          h(Text, { style: s.docType }, (delivered ? (fr ? "REÇU FINAL" : "FINAL RECEIPT") : (fr ? "REÇU DE PAIEMENT" : "PAYMENT RECEIPT")).toUpperCase()),
          h(Text, { style: s.docNo }, data.receiptNumber),
          h(Text, { style: s.docDate }, dt(data.issuedAt)),
          h(Text, { style: s.docDate }, `${fr ? "Commande" : "Order"} ${data.orderCode}`)
        )
      ),

      h(
        Text,
        { style: [s.status, { color: data.paymentVerified ? "#116336" : "#8a6d00" }] },
        data.paymentVerified
          ? (fr ? "PAYÉ ET VÉRIFIÉ" : "PAID AND VERIFIED")
          : (fr ? "PAIEMENT EN ATTENTE" : "PAYMENT PENDING")
      ),

      // ── The money, itemised. Never one blended figure.
      data.shopping && (data.lineItems ?? []).length > 0
        ? h(
            View,
            null,
            h(Text, { style: [s.sectionLabel, { marginTop: 0 }] }, (fr ? "CE QUE NOUS AVONS ACHETÉ POUR VOUS" : "WHAT WE BOUGHT FOR YOU").toUpperCase()),
            ...(data.lineItems ?? []).map((it, i) =>
              h(
                View,
                { style: s.itemRow, key: `li-${i}` },
                h(Text, { style: s.itemName }, `${it.qty && it.qty > 1 ? `${it.qty} × ` : ""}${it.name}`),
                h(Text, { style: s.amount }, "")
              )
            ),
            h(View, { style: s.rule })
          )
        : h(
            View,
            null,
            h(Text, { style: [s.sectionLabel, { marginTop: 0 }] }, (fr ? "PRESTATION" : "SERVICE").toUpperCase()),
            money(data.serviceLabel, ""),
            h(Text, { style: { color: MUTED, marginBottom: 4 } }, data.itemDescription),
            h(View, { style: s.rule })
          ),

      data.shopping ? money(fr ? "Articles (prix du commerçant)" : "Items (the shop's price)", xaf(goods)) : null,
      money(fr ? "Frais de livraison" : "Delivery fee", xaf(fee)),

      h(View, { style: s.ruleStrong }),
      h(
        View,
        { style: s.itemRow },
        h(Text, { style: s.totalLabel }, fr ? "TOTAL" : "TOTAL"),
        h(Text, { style: s.totalAmount }, xaf(total))
      ),

      // Charging less than we were allowed to is worth stating.
      saved > 0
        ? h(
            Text,
            { style: s.saved },
            fr
              ? `Vous aviez autorisé ${xaf(data.goodsCapXaf!)}. Le commerçant a facturé ${xaf(goods)} — nous vous avons facturé ce montant, pas votre plafond.`
              : `You allowed ${xaf(data.goodsCapXaf!)}. The shop charged ${xaf(goods)} — we charged you that, not your cap.`
          )
        : null,

      data.goodsDueAtDoorXaf
        ? h(
            Text,
            { style: s.dueNote },
            fr
              ? `Dont ${xaf(data.goodsDueAtDoorXaf)} réglés en espèces à la livraison.`
              : `Of which ${xaf(data.goodsDueAtDoorXaf)} settled in cash on delivery.`
          )
        : null,

      // ── Payment
      h(Text, { style: s.sectionLabel }, (fr ? "PAIEMENT" : "PAYMENT").toUpperCase()),
      kv(fr ? "Méthode" : "Method", data.paymentMethodLabel),
      data.paymentReference ? kv(fr ? "Référence" : "Reference", data.paymentReference) : null,
      kv(fr ? "Montant réglé" : "Amount paid", data.amountPaidXaf != null ? xaf(data.amountPaidXaf) : "—"),
      data.paymentVerifiedAt ? kv(fr ? "Vérifié le" : "Verified", dt(data.paymentVerifiedAt)) : null,

      // ── Delivery
      h(Text, { style: s.sectionLabel }, (fr ? "LIVRAISON" : "DELIVERY").toUpperCase()),
      kv(fr ? "Client" : "Customer", `${data.customerName} · ${data.customerWhatsapp}`),
      kv(fr ? "Ramassage" : "Pickup", data.pickupLocation),
      kv(fr ? "Livraison" : "Drop-off", data.deliveryLocation),
      data.riderName ? kv(fr ? "Livreur" : "Rider", data.riderName) : null,
      delivered ? kv(fr ? "Livré le" : "Delivered", dt(data.deliveredAt)) : null,
      delivered ? kv(fr ? "Confirmé par" : "Confirmed by", methodLabel(data.confirmMethod, fr)) : null,
      delivered && data.confirmedAt ? kv(fr ? "Confirmé le" : "Confirmed at", dt(data.confirmedAt)) : null,

      // ── The delivery code, dispatch receipt only
      !delivered && data.otpCode
        ? h(
            View,
            { style: s.otpBox },
            h(Text, { style: s.otpLabel }, (fr ? "CODE DE LIVRAISON" : "DELIVERY CODE").toUpperCase()),
            h(Text, { style: s.otp }, data.otpCode),
            h(
              Text,
              { style: { fontSize: 7.5, color: MUTED, marginTop: 6, textAlign: "center" } },
              fr
                ? "À donner au livreur seulement une fois vos articles en main."
                : "Give this to the rider only once your items are in your hands."
            )
          )
        : null,

      // ── The promise, in writing
      data.shopping
        ? h(
            Text,
            { style: s.promise },
            fr
              ? "Aucune marge n'est appliquée sur vos articles : vous payez exactement ce que le commerçant nous a facturé, au franc près. Notre seule rémunération est le frais de livraison indiqué ci-dessus. Le livreur a photographié le reçu du commerçant ; demandez-le à tout moment."
              : "No markup is applied to your items: you pay exactly what the shop charged us, to the franc. Our only earning is the delivery fee shown above. The rider photographed the shop's receipt — ask for it at any time."
          )
        : null,

      h(Text, { style: s.legal }, data.legalNotice),
      h(
        Text,
        { style: s.foot },
        `urbannighlift.com · urbannightlift@gmail.com · +237 680 038 004`
      )
    )
  );

  return pdf(doc).toBlob();
}
