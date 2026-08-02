import "server-only";

import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { referralTerms } from "@/lib/referrals/accrual";
import { createWelcomeToken, welcomeUrl } from "@/lib/welcome/card";
import { sendWhatsApp } from "@/lib/notify/whatsapp";
import type { WelcomeCardData } from "@/components/shared/welcomeCard";

/**
 * Everything needed to welcome one account, assembled once.
 *
 * The card, the message and the link all have to agree — the same name, the
 * same code, the same hours — and they are read by three different callers: the
 * PDF route, the page, and whoever is sending it. Assembling them separately is
 * how a card ends up promising a discount the checkout does not give.
 *
 * Hours and referral terms are read **live** from settings rather than baked in,
 * for the same reason: the owner can change either without a deploy, and a card
 * printed last month must not be the thing that decides what somebody is owed.
 */

export interface Welcome {
  card: WelcomeCardData;
  /** Where to send them. Signed, expiring. */
  url: string;
  /** The message itself, in their language. */
  body: string;
  /** Their WhatsApp number, normalized to digits by the sender. */
  to: string;
  alreadySentAt: Date | null;
}

function hour12(hour: number, fr: boolean): string {
  if (fr) return `${String(hour).padStart(2, "0")}h00`;
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

async function hours(fr: boolean): Promise<{ openFrom: string; openTo: string }> {
  const s = await getOperatingSettings();
  return {
    openFrom: hour12(s.operatingStartHour, fr),
    openTo: hour12(s.operatingEndHour, fr),
  };
}

export async function welcomeForCustomer(customerId: string): Promise<Welcome | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return null;

  const fr = c.preferredLanguage === "FR";
  const [{ openFrom, openTo }, terms] = await Promise.all([hours(fr), referralTerms()]);
  const url = welcomeUrl(createWelcomeToken("customer", c.id));

  // First name only. "Welcome, Jean-Paul Mbarga Ndongo" reads like a bank
  // letter; "Welcome, Jean-Paul" reads like a person wrote it.
  const first = c.fullName.trim().split(/\s+/)[0] || c.fullName;

  return {
    card: {
      kind: "customer",
      locale: fr ? "fr" : "en",
      name: c.fullName,
      joinedAt: c.createdAt,
      referralCode: c.referralCode,
      friendDiscountXaf: terms.friendDiscountXaf,
      referrerRewardPercent: terms.rewardPercent,
      openFrom,
      openTo,
    },
    url,
    body: fr
      ? `Bonjour ${first}, bienvenue chez Urban Night Lift.\n\nNous livrons à Yaoundé de ${openFrom} à ${openTo}, chaque nuit — repas, pharmacie, courses, colis. Vous dites ce qu'il vous faut, nous allons le chercher.\n\nVoici votre carte de bienvenue, avec votre code personnel : ${url}\n\nÀ ce soir.`
      : `Hello ${first}, welcome to Urban Night Lift.\n\nWe deliver across Yaoundé from ${openFrom} to ${openTo}, every night — food, pharmacy, groceries, parcels. You say what you need, we go and get it.\n\nHere is your welcome card, with your own referral code: ${url}\n\nSee you tonight.`,
    to: c.whatsappNumber,
    alreadySentAt: c.welcomeSentAt,
  };
}

export async function welcomeForMerchant(merchantId: string): Promise<Welcome | null> {
  const m = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!m) return null;

  // A business has no language preference of its own, and this city works in
  // both. French is the safer default for a shop in Yaoundé.
  const fr = true;
  const { openFrom, openTo } = await hours(fr);
  const url = welcomeUrl(createWelcomeToken("merchant", m.id));
  const to = m.whatsappNumber ?? m.phone ?? "";

  return {
    card: {
      kind: "merchant",
      locale: "fr",
      name: m.merchantName,
      joinedAt: m.createdAt,
      openFrom,
      openTo,
    },
    url,
    body: `Bonjour, ici Urban Night Lift.\n\nMerci d'avoir inscrit ${m.merchantName}. Nous livrons à Yaoundé de ${openFrom} à ${openTo} : vos clients commandent chez vous la nuit, et un livreur vient chercher la commande.\n\nVoici votre carte de bienvenue et comment ça marche : ${url}\n\nNous vous appelons avant de vous envoyer une première commande.`,
    to,
    alreadySentAt: m.welcomeSentAt,
  };
}

export function loadWelcome(kind: "customer" | "merchant", id: string): Promise<Welcome | null> {
  return kind === "customer" ? welcomeForCustomer(id) : welcomeForMerchant(id);
}

/**
 * Sends it — or hands back the link for a human to send.
 *
 * `welcomeSentAt` is stamped **only when a message genuinely left**. Stamping it
 * on the click-to-chat path would empty the queue of exactly the people nobody
 * has actually written to, which is the one thing this column exists to prevent.
 * The admin endpoint stamps it when the operator confirms they sent it.
 *
 * Never throws. A welcome is not worth failing a signup over.
 */
export async function sendWelcome(
  kind: "customer" | "merchant",
  id: string
): Promise<{ sent: boolean; link?: string; error?: string }> {
  try {
    const welcome = await loadWelcome(kind, id);
    if (!welcome) return { sent: false, error: "No such account." };
    if (!welcome.to) return { sent: false, error: "No WhatsApp number on this account." };

    const result = await sendWhatsApp({
      to: welcome.to,
      event: `${kind}.welcomed`,
      body: welcome.body,
      locale: welcome.card.locale,
      // The approved template's ordered placeholders. Kept minimal so the
      // template stays easy to get through Meta's review.
      templateParams: [welcome.card.name, welcome.url],
      entityType: kind,
      entityId: id,
    });

    if (result.sent) await stamp(kind, id);
    return result;
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

export async function stamp(kind: "customer" | "merchant", id: string): Promise<void> {
  const welcomeSentAt = new Date();
  try {
    if (kind === "customer") {
      await prisma.customer.update({ where: { id }, data: { welcomeSentAt } });
    } else {
      await prisma.merchant.update({ where: { id }, data: { welcomeSentAt } });
    }
  } catch {
    // Worst case somebody is offered the button twice. Not worth an error.
  }
}
