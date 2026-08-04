/**
 * Which pharmacy is worth riding to, at 1 AM.
 *
 * A pharmacy is not a restaurant, and building the medicine page like the food
 * page would be a mistake with a regulator attached to it. Three differences
 * drive everything in this module:
 *
 *  1. **Most are shut.** At 1 AM the question is not "what do I fancy" but "who
 *     is open at all". Nearly every pharmacy in Yaoundé is closed, and the
 *     browse list is short by nature.
 *  2. **One of them is on duty.** The *pharmacie de garde* rotation is published
 *     weekly by the Ordre des Pharmaciens; the pharmacy on duty tonight is
 *     legally obliged to be open and is very often the only correct answer. It
 *     therefore ranks above everything, including a nearer pharmacy.
 *  3. **Prescription medicines must not be browsable.** Dispensing them is
 *     controlled, so this product must never show a prescription drug as a
 *     priced, tappable row the way it shows a plate of poulet DG. That rule is
 *     enforced by the `otcApproved` column, defaulted to false, and read in
 *     exactly one place — the browse route.
 *
 * Pure on purpose, and proved by `scripts/verify-pharmacy-tonight.ts`, because
 * "open" here spans midnight and midnight arithmetic is where this codebase has
 * been wrong before.
 */

export interface PharmacyLike {
  id: string;
  name: string;
  nightOpen: boolean;
  open24h: boolean;
  onDutyTonight: boolean;
}

/**
 * Is the trading night running right now?
 *
 * The window wraps — 18:00 to 04:00 — so a plain `hour >= start && hour < end`
 * is false for every hour of it. Shared with the food browse page through the
 * same settings so the two pages can never disagree about whether it is night.
 */
export function isNightHour(hour: number, startHour: number, endHour: number): boolean {
  return startHour <= endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

/**
 * Open at this hour.
 *
 * `open24h` beats everything, including the operating window: a 24-hour
 * pharmacy is open at 3 AM whether or not we happen to be trading, and a
 * customer looking at the list wants to know that.
 */
export function isOpenNow(
  p: Pick<PharmacyLike, "nightOpen" | "open24h">,
  hour: number,
  startHour: number,
  endHour: number
): boolean {
  return p.open24h || (isNightHour(hour, startHour, endHour) && p.nightOpen);
}

/**
 * Is a duty shift covering this moment?
 *
 * Inclusive at both ends. A roster is written as whole days — "from Monday to
 * Sunday" — and a shift that expires at the instant its end date begins would
 * leave the last night of every rotation with no pharmacy on duty at all.
 */
export function isOnDuty(shift: { startsOn: Date; endsOn: Date }, now: Date): boolean {
  return shift.startsOn.getTime() <= now.getTime() && shift.endsOn.getTime() >= now.getTime();
}

/**
 * The order the list is read in, and it is not negotiable.
 *
 * On duty, then open, then everyone else alphabetically. Sorting by distance
 * first would look helpful and send somebody to a nearer pharmacy with the
 * shutters down — the exact failure the duty rotation exists to prevent.
 */
export function rankPharmacies<T extends PharmacyLike & { openNow: boolean }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.onDutyTonight) - Number(a.onDutyTonight) ||
      Number(b.openNow) - Number(a.openNow) ||
      a.name.localeCompare(b.name)
  );
}

/**
 * What the shelf items a customer tapped are likely to cost.
 *
 * An **estimate**, and it is used to seed the spending cap — never quoted as a
 * price. The pharmacy's till decides the real amount and the rider photographs
 * the receipt, which is how every other shopping service in this product
 * already works. An item whose price we do not know contributes nothing rather
 * than a guess.
 */
export function shelfEstimateXaf(items: { priceXaf: number | null; qty?: number }[]): number {
  return items.reduce((sum, it) => {
    const qty = Math.max(1, Math.round(it.qty ?? 1));
    return sum + (typeof it.priceXaf === "number" && it.priceXaf > 0 ? it.priceXaf * qty : 0);
  }, 0);
}
