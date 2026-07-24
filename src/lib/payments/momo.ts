/**
 * Mobile-money merchant-code payment helpers.
 *
 * The owner has a MoMo/Orange MERCHANT CODE (not an aggregator API), so the
 * customer pays to that code and enters the transaction reference; the
 * dispatcher confirms receipt. This module is the single seam where a future
 * aggregator (Fapshi/Campay/Notch Pay) auto-confirm provider would slot in.
 */
export interface MerchantPayment {
  mtnMerchantCode: string | null;
  mtnUssdTemplate: string | null;
  orangeMerchantCode: string | null;
  orangeUssdTemplate: string | null;
}

/** Fill the {amount} placeholder in a USSD template, e.g. *126*4*857539*{amount}#. */
export function buildUssd(template: string | null, amountXaf: number | null): string | null {
  if (!template) return null;
  const amount = amountXaf && amountXaf > 0 ? String(amountXaf) : "";
  return template.replace(/\{amount\}/gi, amount);
}

/** tel: href for a tap-to-dial USSD string (encode # as %23). */
export function ussdTelHref(ussd: string | null): string | null {
  if (!ussd) return null;
  return `tel:${ussd.replace(/#/g, "%23")}`;
}
