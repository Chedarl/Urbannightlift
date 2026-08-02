/**
 * The welcome card — the first thing we ever hand someone.
 *
 * Every other PDF in this product is a document: a receipt is filed, an order
 * summary is checked. This one is the opposite. It exists to be **looked at and
 * forwarded**, so it is the one place the app's own night palette belongs on
 * paper — ink, violet and gold, generous space, the arithmetic-free page.
 *
 * ## Why it renders in two places
 *
 * The same component produces a **Blob in the browser** (the customer taps
 * share, and on a phone that drops the PDF straight into WhatsApp with no Meta
 * account involved) and a **Buffer on the server** (the link we send resolves to
 * a real file). Two renderers, one layout — a second copy of this page would
 * drift within a month, and the two would disagree about somebody's referral
 * code.
 *
 * That is why there is no `"use client"` here: the module is imported from both
 * sides, and `@react-pdf/renderer` is only ever reached through a dynamic
 * import inside a function, so it never runs during SSR or build.
 *
 * ## What is deliberately not on it
 *
 * No PIN, no address, no order history, no phone number beyond our own. The
 * card is built on the assumption that it gets forwarded — that is its whole
 * purpose — so it carries a name, a date, and a referral code the holder
 * *wants* copied, and nothing else worth having.
 */
import { createElement as h } from "react";

export interface WelcomeCardData {
  kind: "customer" | "merchant";
  locale: "en" | "fr";
  /** Person's name, or the business's name. */
  name: string;
  joinedAt: Date;
  /** Customers only. Absent on a merchant card. */
  referralCode?: string | null;
  /** What their friend saves, in XAF. Read live from settings, never hardcoded. */
  friendDiscountXaf?: number;
  /**
   * What they earn, as a **percentage of the delivery fee** their friend pays —
   * which is what `referralReward` actually computes. Printing it as a flat XAF
   * amount would put a number on this card that no order will ever match.
   */
  referrerRewardPercent?: number;
  openFrom: string;
  openTo: string;
  /** Absolute URL. Omitted rather than guessed — the card must never fail to render. */
  logoSrc?: string | null;
}

const INK = "#08060e";
const INK_CARD = "#110b1c";
const VIOLET = "#9645de";
const VIOLET_DEEP = "#3c1361";
const GOLD = "#d4af37";
const MIST = "#e3dced";
const MIST_DIM = "#b4a9c6";

function xaf(n: number, fr: boolean): string {
  const digits = new Intl.NumberFormat(fr ? "fr-FR" : "en-GB").format(n);
  return `${digits} XAF`;
}

function joinedLabel(d: Date, fr: boolean): string {
  return new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** The copy, in one place, so the two languages cannot drift apart. */
function copy(data: WelcomeCardData) {
  const fr = data.locale === "fr";
  const merchant = data.kind === "merchant";

  return {
    brand: "URBAN NIGHT LIFT",
    city: fr ? "Yaoundé · Toute la nuit" : "Yaoundé · All night",
    hello: merchant
      ? fr
        ? "Bienvenue à bord"
        : "Welcome aboard"
      : fr
        ? "Bienvenue"
        : "Welcome",
    since: fr ? `Membre depuis le ${joinedLabel(data.joinedAt, true)}` : `Member since ${joinedLabel(data.joinedAt, false)}`,
    lede: merchant
      ? fr
        ? "Vos clients commandent la nuit, nous livrons. Votre commerce apparaît dans l'application, les clients choisissent chez vous, et un livreur vient chercher la commande."
        : "Your customers order at night and we deliver. Your business appears in the app, customers pick you, and a rider comes to collect the order."
      : fr
        ? "Nous livrons quand tout est fermé. Repas, pharmacie, courses, colis — vous dites ce qu'il vous faut, nous allons le chercher et nous vous l'apportons."
        : "We deliver when everything else is shut. Food, pharmacy, groceries, parcels — you say what you need, we go and get it, and we bring it to you.",
    hoursLabel: fr ? "Nous roulons" : "We ride",
    hours: fr ? `${data.openFrom} à ${data.openTo}, chaque nuit` : `${data.openFrom} to ${data.openTo}, every night`,
    stepsTitle: merchant ? (fr ? "Ce qu'il faut faire" : "What to do") : fr ? "Comment ça marche" : "How it works",
    steps: merchant
      ? fr
        ? [
            "Gardez vos articles et vos prix à jour — c'est ce que le client voit.",
            "Restez joignable sur WhatsApp le soir : nous appelons avant d'envoyer un livreur.",
            "Connectez-vous sur urbannighlift.com/merchant pour ouvrir ou fermer votre boutique.",
          ]
        : [
            "Keep your items and prices current — that is what the customer sees.",
            "Stay reachable on WhatsApp at night: we call before sending a rider.",
            "Sign in at urbannighlift.com/merchant to open or close your shop.",
          ]
      : fr
        ? [
            "Dites-nous ce qu'il vous faut et où.",
            "Nous fixons le prix, vous payez, un livreur part.",
            "Donnez votre code au livreur — une fois la commande en main.",
          ]
        : [
            "Tell us what you need and where.",
            "We price it, you pay, a rider goes.",
            "Give the rider your code — only once it is in your hands.",
          ],
    promiseTitle: fr ? "Notre promesse" : "Our promise",
    promise: merchant
      ? fr
        ? "Nous n'ajoutons aucune marge sur vos prix. Le client paie ce que vous facturez ; nous gagnons sur la livraison."
        : "We add nothing to your prices. The customer pays what you charge; we earn on the delivery."
      : fr
        ? "Aucune marge sur ce que nous achetons pour vous. Vous payez exactement le prix du commerçant — notre gain, c'est la livraison, annoncée d'avance."
        : "No markup on anything we buy for you. You pay exactly what the shop charged — what we earn is the delivery fee, told to you in advance.",
    codeTitle: fr ? "Votre code" : "Your code",
    // Only promises what the settings actually pay. A card printed with a
    // discount the checkout does not apply is worse than a card with no offer
    // on it at all.
    codeBlurb: (() => {
      const saves = data.friendDiscountXaf ?? 0;
      const earns = data.referrerRewardPercent ?? 0;
      if (saves > 0 && earns > 0) {
        return fr
          ? `Donnez-le à un ami : il économise ${xaf(saves, true)} sur sa première nuit, et vous gagnez ${earns} % des frais de livraison de chacune de ses commandes.`
          : `Give it to a friend: they save ${xaf(saves, false)} on their first night, and you earn ${earns}% of the delivery fee on every order they place.`;
      }
      if (saves > 0) {
        return fr
          ? `Donnez-le à un ami : il économise ${xaf(saves, true)} sur sa première nuit.`
          : `Give it to a friend: they save ${xaf(saves, false)} on their first night.`;
      }
      if (earns > 0) {
        return fr
          ? `Donnez-le à un ami et gagnez ${earns} % des frais de livraison de chacune de ses commandes.`
          : `Give it to a friend and earn ${earns}% of the delivery fee on every order they place.`;
      }
      return fr
        ? "Votre code personnel. Donnez-le à un ami pour qu'il commence avec nous."
        : "Your own code. Give it to a friend so they can start with us.";
    })(),
    safety: fr
      ? "Nous ne demandons jamais votre code PIN Mobile Money, votre code secret Orange, ni un OTP de votre banque. Jamais. Si quelqu'un le demande en notre nom, ce n'est pas nous."
      : "We never ask for your Mobile Money PIN, your Orange secret code, or a bank OTP. Not once. If somebody asks in our name, it is not us.",
    footer: "urbannighlift.com · urbannightlift@gmail.com · +237 680 038 004",
  };
}

/** Builds the document element. Shared by both renderers. */
async function buildDocument(data: WelcomeCardData) {
  const RP = await import("@react-pdf/renderer");
  const { Document, Page, View, Text, Image, StyleSheet } = RP;
  const t = copy(data);

  const s = StyleSheet.create({
    page: {
      backgroundColor: INK,
      color: MIST,
      fontFamily: "Helvetica",
      fontSize: 10,
      paddingHorizontal: 52,
      paddingVertical: 44,
    },

    // A gold hairline across the top — the whole masthead, no image required.
    topRule: { height: 2.5, backgroundColor: GOLD, marginBottom: 22 },

    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    logo: { width: 30, height: 30, marginBottom: 8 },
    brand: { fontSize: 12, fontFamily: "Helvetica-Bold", letterSpacing: 2.4, color: MIST },
    city: { fontSize: 7.5, letterSpacing: 1.4, color: GOLD, marginTop: 4 },

    hello: { fontSize: 26, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 30 },
    name: { fontSize: 26, fontFamily: "Helvetica-Bold", color: VIOLET, marginTop: 2 },
    since: { fontSize: 8.5, color: MIST_DIM, marginTop: 8, letterSpacing: 0.6 },

    lede: { fontSize: 11, lineHeight: 1.6, color: MIST, marginTop: 20 },

    hoursBox: {
      marginTop: 20,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: VIOLET_DEEP,
      borderRadius: 8,
    },
    hoursLabel: { fontSize: 7.5, letterSpacing: 1.4, color: "#dbc8f5" },
    hours: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#ffffff", marginTop: 3 },

    sectionTitle: { fontSize: 7.5, letterSpacing: 1.6, color: GOLD, marginTop: 24, marginBottom: 9 },

    step: { flexDirection: "row", marginBottom: 7 },
    stepNo: {
      width: 15,
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: GOLD,
    },
    stepText: { flex: 1, fontSize: 10, lineHeight: 1.5, color: MIST },

    promise: { fontSize: 9.5, lineHeight: 1.55, color: MIST },

    codeBox: {
      marginTop: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: GOLD,
      borderRadius: 8,
      backgroundColor: INK_CARD,
    },
    codeLabel: { fontSize: 7.5, letterSpacing: 1.6, color: GOLD },
    code: {
      fontSize: 24,
      fontFamily: "Courier-Bold",
      color: "#ffffff",
      letterSpacing: 3,
      marginTop: 6,
      marginBottom: 8,
    },
    codeBlurb: { fontSize: 9, lineHeight: 1.5, color: MIST_DIM },

    safety: { fontSize: 7.5, lineHeight: 1.5, color: MIST_DIM, marginTop: 24 },

    footRule: { height: 0.7, backgroundColor: "#2a2140", marginTop: 20, marginBottom: 10 },
    footer: { fontSize: 7.5, color: MIST_DIM, textAlign: "center", letterSpacing: 0.4 },
  });

  const showCode = data.kind === "customer" && Boolean(data.referralCode);

  return h(
    Document,
    { title: `${t.brand} — ${t.hello}`, author: "Urban Night Lift" },
    h(
      Page,
      /**
       * A4, and it must stay one page.
       *
       * A5 was the first instinct — card-sized and charming — and it silently
       * produced a **two-page** card, which is the one thing a welcome card
       * cannot be. Checked rather than assumed: the page count is asserted in
       * `scripts/verify-welcome-card.ts`, in both languages and both variants,
       * because French runs noticeably longer than English and is the version
       * that would break first.
       *
       * The generous padding is deliberate and is what does the work here.
       * Whitespace is most of why a page reads as considered rather than
       * printed.
       */
      { size: "A4", style: s.page },
      h(View, { style: s.topRule }),

      h(
        View,
        { style: s.head },
        h(
          View,
          null,
          // Only if we were given one. A missing image must never be the reason
          // somebody's welcome fails to render.
          data.logoSrc ? h(Image, { src: data.logoSrc, style: s.logo }) : null,
          h(Text, { style: s.brand }, t.brand),
          h(Text, { style: s.city }, t.city)
        )
      ),

      h(Text, { style: s.hello }, t.hello),
      h(Text, { style: s.name }, data.name),
      h(Text, { style: s.since }, t.since),

      h(Text, { style: s.lede }, t.lede),

      h(
        View,
        { style: s.hoursBox },
        h(Text, { style: s.hoursLabel }, t.hoursLabel.toUpperCase()),
        h(Text, { style: s.hours }, t.hours)
      ),

      h(Text, { style: s.sectionTitle }, t.stepsTitle.toUpperCase()),
      ...t.steps.map((step, i) =>
        h(
          View,
          { style: s.step, key: `step-${i}` },
          h(Text, { style: s.stepNo }, `${i + 1}`),
          h(Text, { style: s.stepText }, step)
        )
      ),

      h(Text, { style: s.sectionTitle }, t.promiseTitle.toUpperCase()),
      h(Text, { style: s.promise }, t.promise),

      showCode
        ? h(
            View,
            { style: s.codeBox },
            h(Text, { style: s.codeLabel }, t.codeTitle.toUpperCase()),
            h(Text, { style: s.code }, data.referralCode as string),
            h(Text, { style: s.codeBlurb }, t.codeBlurb)
          )
        : null,

      h(Text, { style: s.safety }, t.safety),

      h(View, { style: s.footRule }),
      h(Text, { style: s.footer }, t.footer)
    )
  );
}

/** In the browser: a Blob to download, or to hand to the native share sheet. */
export async function generateWelcomeCardBlob(data: WelcomeCardData): Promise<Blob> {
  const RP = await import("@react-pdf/renderer");
  return RP.pdf(await buildDocument(data)).toBlob();
}

/** On the server: a Buffer to stream, so a link can hand over a real file. */
export async function renderWelcomeCardBuffer(data: WelcomeCardData): Promise<Buffer> {
  const RP = await import("@react-pdf/renderer");
  return RP.renderToBuffer(await buildDocument(data));
}
