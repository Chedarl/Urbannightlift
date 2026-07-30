import { QUOTE_TARGET_MINUTES } from "@/lib/orders/autoPrice";

/**
 * How a price is described to the customer, in one place.
 *
 * Every fee used to be labelled "Estimated delivery fee" under a banner saying
 * the order was not confirmed until somebody accepted it — which taught people
 * that the number might move, even when it was the fixed zone tariff and could
 * not. That is the opposite of the certainty a ride app gives you before you
 * tap. Now a firm price says it is the price, and a price that genuinely needs
 * a human says so *and* how long that takes.
 *
 * The client decides which copy to show; the server decides what is actually
 * charged (`decideAutoPrice`). These must agree on the same rule, which is why
 * the wording lives next to the rule rather than inline in six forms.
 */
export interface PriceCopy {
  /** Field label for the fee row. */
  label: string;
  /** One line under it, setting the expectation. */
  note: string;
  /** Sticky-CTA wording when a fee is known. */
  cta: string;
}

export function priceCopy(firm: boolean, fr: boolean, shopping = false): PriceCopy {
  if (firm) {
    // On a shopping order the FEE is fixed but the shopping is not — nobody
    // knows the bill until the rider is at the counter. Saying "this is your
    // price, it won't change" there would be a promise we cannot keep, so the
    // copy is explicit that this covers the delivery only.
    if (shopping) {
      return {
        label: fr ? "Frais de livraison (fixes)" : "Delivery fee (fixed)",
        note: fr
          ? "Ce montant est fixé et ne changera pas. Le coût des articles s'y ajoute — vous payez exactement le reçu, sans marge, dans la limite que vous fixez."
          : "This part is fixed and won't change. The cost of the items is added on top — you pay exactly what the receipt says, with no markup, up to the cap you set.",
        cta: fr ? "Commander" : "Place order",
      };
    }
    return {
      label: fr ? "Frais de livraison" : "Delivery fee",
      note: fr
        ? "C'est votre prix — le tarif de votre zone, fixé. Il ne changera pas après votre commande."
        : "This is your price — your zone's set rate. It won't change after you order.",
      cta: fr ? "Commander" : "Place order",
    };
  }
  return {
    label: fr ? "Frais estimés" : "Estimated fee",
    note: fr
      ? `Cette course a besoin d'un prix confirmé par notre équipe — sous ${QUOTE_TARGET_MINUTES} minutes environ. Rien n'est payé avant votre accord.`
      : `This one needs a price confirmed by our team — usually within ${QUOTE_TARGET_MINUTES} minutes. Nothing is paid until you agree to it.`,
    cta: fr ? "Demander un prix" : "Request a price",
  };
}
