/**
 * Does the receipt say what the rider said it says?
 *
 * A shopping order has one number that decides what a customer is charged: the
 * amount the rider types after paying the shop. Until now nothing checked it,
 * because nothing could — the receipt photo was uploaded and then never looked
 * at by anybody.
 *
 * This is not a fraud detector and must not be described as one. It is a
 * second reading of the same piece of paper, and its whole value is in the
 * cases where the two readings disagree — which are far more often a typo (a
 * missing zero, 4 500 keyed as 450) than anything dishonest.
 *
 * ## Why this protects the rider more than it polices them
 *
 * v17 set the requirement for the shopping money as building it "so it does not
 * show that we want to steal from them". The mirror of that is the rider
 * handing over somebody else's cash all night with nothing but their own word
 * for what they spent. A receipt that has been read and agrees with them is the
 * thing that makes an accusation impossible — which is worth more to the rider
 * than to us.
 *
 * So a disagreement raises a question for a dispatcher. It never changes an
 * amount, never blocks a delivery, and never accuses anybody.
 */

/**
 * How far apart the two readings may be before it is worth a human's time.
 *
 * Two independent sources of small noise: a photograph of a thermal receipt in
 * a dark street is genuinely hard to read, and XAF is written 4 500 / 4.500 /
 * 4,500 so a misread separator moves a digit. Below this, chasing it costs more
 * than it saves.
 */
export const TOLERANCE_XAF = 100;
export const TOLERANCE_PERCENT = 2;

export type ReceiptVerdict = "agrees" | "unreadable" | "differs";

export interface ReceiptCheck {
  verdict: ReceiptVerdict;
  /** Positive when the receipt is higher than what was typed. */
  deltaXaf: number;
  /**
   * True only when somebody should actually look. Deliberately separate from
   * the verdict: an unreadable receipt is not a discrepancy, it is a photograph
   * that needs retaking, and treating the two the same would fill the
   * attention queue with bad lighting.
   */
  needsLook: boolean;
}

/**
 * Compares what the rider typed with what the receipt appears to say.
 *
 * `readXaf` is null when the receipt could not be read at all — no key
 * configured, an unreadable photo, a model that declined. That is explicitly
 * **not** a discrepancy, because "we could not check" and "the numbers
 * disagree" are different facts and only one of them is worth interrupting a
 * dispatcher for.
 */
export function checkReceipt(typedXaf: number | null, readXaf: number | null): ReceiptCheck {
  if (typedXaf == null || readXaf == null || !Number.isFinite(readXaf) || readXaf <= 0) {
    return { verdict: "unreadable", deltaXaf: 0, needsLook: false };
  }

  const deltaXaf = readXaf - typedXaf;
  const allowed = Math.max(TOLERANCE_XAF, Math.round((typedXaf * TOLERANCE_PERCENT) / 100));

  if (Math.abs(deltaXaf) <= allowed) {
    return { verdict: "agrees", deltaXaf, needsLook: false };
  }

  return { verdict: "differs", deltaXaf, needsLook: true };
}

/** One line a dispatcher can act on, in the order they need it. */
export function describeCheck(check: ReceiptCheck, typedXaf: number | null): string {
  const xaf = (n: number) => `${Math.abs(n).toLocaleString("fr-FR")} XAF`;

  if (check.verdict === "unreadable") {
    return "The receipt could not be read. Nothing is wrong — it just was not checked.";
  }
  if (check.verdict === "agrees") {
    return "The receipt matches what the rider recorded.";
  }
  return check.deltaXaf > 0
    ? `The receipt looks like ${xaf(check.deltaXaf)} MORE than the ${xaf(typedXaf ?? 0)} recorded. The rider may be out of pocket.`
    : `The receipt looks like ${xaf(check.deltaXaf)} LESS than the ${xaf(typedXaf ?? 0)} recorded. The customer may be about to be overcharged.`;
}
