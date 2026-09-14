/**
 * Which ways of paying actually work tonight.
 *
 * ## The hole this closes
 *
 * Production has `mtnMerchantCode` set and **`orangeMerchantCode` null**. Every
 * one of the five order forms offered Orange Money anyway, and the payment card
 * ended with:
 *
 * ```ts
 * if (!code) return null;
 * ```
 *
 * So a customer who chose Orange Money — roughly half the mobile-money market
 * in Cameroon — placed their order, landed on the payment screen, and was shown
 * **nothing at all**. Not an error, not an explanation, not a way to switch.
 * A blank space where the instructions should be, and an order they had no way
 * to pay for.
 *
 * Nothing recorded it either: no failure, no log line, no counter. From inside
 * the product it looked like a customer who simply wandered off. The database
 * says five customers signed up and **not one order was ever completed**.
 *
 * ## The rule
 *
 * A method is offered only if a customer can actually complete it:
 *
 *  - **Cash** always works. It needs no configuration — the rider takes the
 *    money at the door — so it is the one method that can never be missing.
 *  - **MTN MoMo** and **Orange Money** need a merchant code. Without one there
 *    is no number to send money to, and offering the button is a promise the
 *    product cannot keep.
 *
 * The USSD template is deliberately *not* required. It is a convenience — it
 * turns the code into a tappable dial string — and a customer can always pay by
 * typing the merchant code by hand. Requiring it would switch off a method that
 * genuinely works.
 *
 * Pure, and proved by `scripts/verify-payment-methods.ts`.
 */

export type PaymentMethod = "CASH" | "MTN_MOMO" | "ORANGE_MONEY";

/** Only the fields that decide whether a method can be completed. */
export interface PaymentConfig {
  mtnMerchantCode?: string | null;
  orangeMerchantCode?: string | null;
}

export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "MTN_MOMO", "ORANGE_MONEY"];

/** A code that is present but blank is not configured. */
function usable(code: string | null | undefined): boolean {
  return typeof code === "string" && code.trim().length > 0;
}

/**
 * The methods a customer may be offered, in the order they should appear.
 *
 * Cash leads because it is the one that always works; a screen whose first
 * option is guaranteed to function reads as working even when the rest is not.
 */
export function configuredPaymentMethods(config: PaymentConfig): PaymentMethod[] {
  const methods: PaymentMethod[] = ["CASH"];
  if (usable(config.mtnMerchantCode)) methods.push("MTN_MOMO");
  if (usable(config.orangeMerchantCode)) methods.push("ORANGE_MONEY");
  return methods;
}

export function isPaymentMethodConfigured(method: PaymentMethod, config: PaymentConfig): boolean {
  return configuredPaymentMethods(config).includes(method);
}

/**
 * What to tell somebody who already has an order on an unconfigured method.
 *
 * Existing orders are the reason the payment card must never render nothing.
 * Anyone who chose Orange Money before this shipped still has an order and
 * still needs to pay for it, and the honest answer names the alternative rather
 * than leaving a blank.
 */
export function unavailableMethodNotice(
  method: PaymentMethod,
  config: PaymentConfig,
  fr: boolean
): string {
  const others = configuredPaymentMethods(config).filter((m) => m !== method);
  const label = (m: PaymentMethod) =>
    m === "CASH" ? (fr ? "espèces à la livraison" : "cash on delivery") : m === "MTN_MOMO" ? "MTN MoMo" : "Orange Money";

  const alternatives = others.map(label);
  const list =
    alternatives.length === 0
      ? fr
        ? "un autre moyen"
        : "another way"
      : alternatives.length === 1
        ? alternatives[0]
        : `${alternatives.slice(0, -1).join(", ")} ${fr ? "ou" : "or"} ${alternatives[alternatives.length - 1]}`;

  const name = label(method);
  return fr
    ? `${name} n'est pas disponible pour le moment. Votre commande est bien enregistrée — vous pouvez payer par ${list}, ou nous écrire et nous réglons ça avec vous.`
    : `${name} is not available right now. Your order is saved — you can pay by ${list}, or message us and we will sort it out with you.`;
}
