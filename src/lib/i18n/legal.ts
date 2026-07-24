/**
 * Exact legal / safety text, kept as raw string constants so the same verbatim
 * text is rendered on the order form, the order review screen, and inside the
 * generated WhatsApp message. Do not paraphrase or edit without owner approval.
 */
import type { Locale } from "./index";

export const SAFETY_DISCLAIMER_EN =
  "Important Notice: Goods transported by Urban Night Lift are insured only up to a maximum declared value of XAF 25,000. Any item valued above XAF 25,000 must be clearly declared before transportation and accepted by Urban Night Lift before pickup. Failure to declare high-value goods may limit or exclude compensation in case of loss, damage, dispute, or delivery incident. Urban Night Lift reserves the right to reject unsafe, illegal, undeclared, restricted, oversized, or high-risk items.";

export const SAFETY_DISCLAIMER_FR =
  "Avis important : Les biens transportés par Urban Night Lift sont assurés uniquement jusqu'à une valeur déclarée maximale de 25 000 XAF. Tout article d'une valeur supérieure à 25 000 XAF doit être clairement déclaré avant le transport et accepté par Urban Night Lift avant la récupération. Le défaut de déclaration des biens de grande valeur peut limiter ou exclure toute indemnisation en cas de perte, dommage, litige ou incident de livraison. Urban Night Lift se réserve le droit de refuser les articles dangereux, illégaux, non déclarés, restreints, surdimensionnés ou à haut risque.";

/** Shorter legal notice used inside the generated WhatsApp order message. */
export const LEGAL_NOTICE_EN =
  "Goods are insured only up to XAF 25,000. Goods above XAF 25,000 must be clearly declared and accepted before transportation. Undeclared high-value, illegal, unsafe, restricted, oversized, or high-risk items may be rejected or excluded from compensation.";

export const LEGAL_NOTICE_FR =
  "Les biens sont assurés uniquement jusqu'à 25 000 XAF. Les biens d'une valeur supérieure à 25 000 XAF doivent être clairement déclarés et acceptés avant le transport. Les articles non déclarés de grande valeur, illégaux, dangereux, restreints, surdimensionnés ou à haut risque peuvent être refusés ou exclus de toute indemnisation.";

export const SAFETY_MESSAGE_EN =
  "For rider and customer safety, Urban Night Lift may reject orders involving unsafe locations, illegal or restricted goods, undeclared high-value items, oversized items, or requests outside our current operating zone.";

export const SAFETY_MESSAGE_FR =
  "Pour la sécurité du livreur et du client, Urban Night Lift peut refuser les commandes impliquant des lieux dangereux, des biens illégaux ou restreints, des articles de grande valeur non déclarés, des articles surdimensionnés ou des demandes hors de notre zone d'opération actuelle.";

export const RESTRICTED_ZONE_NOTICE_EN =
  "Orders outside safe operating zones may be rejected for rider and customer safety.";

export const RESTRICTED_ZONE_NOTICE_FR =
  "Les commandes hors des zones d'opération sûres peuvent être refusées pour la sécurité du livreur et du client.";

export const CLOSED_NOTICE_EN =
  "Urban Night Lift is currently closed. We operate from 6:00 PM to 4:00 AM. You may still submit a request for review, but immediate delivery is not guaranteed.";

export const CLOSED_NOTICE_FR =
  "Urban Night Lift est actuellement fermé. Nous opérons de 18h00 à 4h00. Vous pouvez toujours soumettre une demande pour examen, mais la livraison immédiate n'est pas garantie.";

export const INSURED_VALUE_CAP_XAF = 25000;

export function getDisclaimer(locale: Locale): string {
  return locale === "fr" ? SAFETY_DISCLAIMER_FR : SAFETY_DISCLAIMER_EN;
}

export function getLegalNotice(locale: Locale): string {
  return locale === "fr" ? LEGAL_NOTICE_FR : LEGAL_NOTICE_EN;
}

export function getSafetyMessage(locale: Locale): string {
  return locale === "fr" ? SAFETY_MESSAGE_FR : SAFETY_MESSAGE_EN;
}

export function getClosedNotice(locale: Locale): string {
  return locale === "fr" ? CLOSED_NOTICE_FR : CLOSED_NOTICE_EN;
}
