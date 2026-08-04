import "server-only";

import { kimiJson, kimiConfigured } from "@/lib/ai/kimi";
import { signedImageUrl } from "@/lib/ai/images";

/**
 * Reading a MTN MoMo or Orange Money confirmation screenshot.
 *
 * Verifying a payment today means a dispatcher opening the screenshot, reading
 * a transaction reference off a phone screen, and typing it into a box. That
 * sits directly on the gap the UX review called one of three structural
 * problems with this product: the customer pays, and then waits for a human to
 * notice.
 *
 * This pre-fills the box. **It does not verify anything.** Nothing here sets
 * `paymentStatus`, and a dispatcher still presses the button — because
 * "verified" is the word that sends a rider out with somebody's goods, and a
 * model's reading of a screenshot is not evidence that money arrived.
 *
 * ## What it is not allowed to see
 *
 * A payment screenshot shows a reference, an amount and a sender. It does not
 * show a PIN and it does not show an account balance — and this asks for
 * neither. The privacy page already promises exactly that: "We see the
 * reference and the amount — never your PIN, and never your account balance."
 * The prompt keeps that promise rather than assuming a screenshot is harmless.
 */

export interface ProofReading {
  reference: string | null;
  amountXaf: number | null;
  /** The number the money came from, as printed. */
  senderPhone: string | null;
  /** MTN | ORANGE | null when it is not clear which. */
  provider: string | null;
}

interface Answer {
  reference?: string | null;
  amountXaf?: number | null;
  senderPhone?: string | null;
  provider?: string | null;
  readable?: boolean;
}

const SCHEMA = {
  type: "object",
  required: ["readable"],
  properties: {
    readable: { type: "boolean" },
    reference: { type: "string" },
    amountXaf: { type: "number" },
    senderPhone: { type: "string" },
    provider: { type: "string" },
  },
} as const;

const SYSTEM = `You read MTN Mobile Money and Orange Money confirmation
screenshots from Cameroon, and report only what is printed on them.

Return:
- reference: the transaction id / reference exactly as shown, characters and
  case unchanged. Do not tidy it, do not remove dashes.
- amountXaf: the amount sent, as a plain integer. "4 500 FCFA" is 4500.
- senderPhone: the number the money came from, digits only.
- provider: "MTN" or "ORANGE", or omit it if the screenshot does not say.
- readable: false if this is not a payment confirmation at all, or you cannot
  make out the reference.

Never guess a reference. A wrong reference is worse than none — somebody uses
it to decide whether money actually arrived.

Never report a PIN, a secret code or an account balance, even if one is visible
in the image. Those are not part of the answer.`;

/**
 * Reads one payment screenshot, or returns null.
 *
 * Null when there is no key, no image, or nothing legible — and the dispatcher
 * simply types the reference as they always have.
 */
export async function readPaymentProof(
  proofPath: string | null,
  orderId?: string
): Promise<ProofReading | null> {
  if (!kimiConfigured() || !proofPath) return null;

  const url = await signedImageUrl(proofPath);
  if (!url) return null;

  const answer = await kimiJson<Answer>({
    purpose: "payment.read",
    system: SYSTEM,
    user: "Read this mobile money confirmation and report the reference, amount and sender.",
    images: [url],
    schema: SCHEMA as unknown as Record<string, unknown>,
    entityType: "order",
    entityId: orderId,
  });
  if (!answer || answer.readable === false) return null;

  const reference = answer.reference?.trim() || null;
  // A reading with no reference is not worth showing a dispatcher: the
  // reference is the only field they cannot get from the order itself.
  if (!reference) return null;

  const provider = answer.provider?.trim().toUpperCase();

  return {
    reference: reference.slice(0, 60),
    amountXaf:
      typeof answer.amountXaf === "number" && Number.isFinite(answer.amountXaf) && answer.amountXaf > 0
        ? Math.round(answer.amountXaf)
        : null,
    senderPhone: answer.senderPhone?.replace(/[^\d]/g, "").slice(0, 15) || null,
    provider: provider === "MTN" || provider === "ORANGE" ? provider : null,
  };
}
