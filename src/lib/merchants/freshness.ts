/**
 * How recently a restaurant told us what they actually have.
 *
 * The single line on the customer's screen that no competitor here shows.
 * Everywhere else you order a dish, wait forty minutes, and find out it ran out
 * — the restaurant knew the whole time and nobody had asked.
 *
 * Three states, and the third is the point: **a restaurant nobody has asked
 * tonight says so.** Claiming everything is available because nothing has been
 * marked otherwise is exactly the quiet lie this feature exists to stop, and it
 * is a lie we would be telling with a straight face on our own screen.
 *
 * Pure, so it can be proved without a database and used identically on the
 * browse page and the admin row.
 */

/** Inside this, the answer is about tonight's fire rather than last night's. */
export const FRESH_MINUTES = 180;

export interface Freshness {
  /** Recent enough to trust for an order placed right now. */
  fresh: boolean;
  /** What to show. Short — it sits beside the open/closed chip. */
  text: string;
}

export function freshLabel(checkedAt: string | Date | null, fr = false, now: Date = new Date()): Freshness {
  if (!checkedAt) {
    return { fresh: false, text: fr ? "pas confirmé ce soir" : "not confirmed tonight" };
  }
  const at = typeof checkedAt === "string" ? new Date(checkedAt) : checkedAt;
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));

  if (mins > FRESH_MINUTES) {
    return { fresh: false, text: fr ? "pas confirmé ce soir" : "not confirmed tonight" };
  }
  if (mins < 1) return { fresh: true, text: fr ? "confirmé à l'instant" : "confirmed just now" };
  if (mins < 60) {
    return { fresh: true, text: fr ? `confirmé il y a ${mins} min` : `confirmed ${mins} min ago` };
  }
  const hours = Math.round(mins / 60);
  return { fresh: true, text: fr ? `confirmé il y a ${hours} h` : `confirmed ${hours}h ago` };
}
