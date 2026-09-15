/**
 * A tip for the rider.
 *
 * ## Why this exists at all
 *
 * The rider takes 60% of a delivery fee with a 500 XAF floor, so on the
 * cheapest band — 1,000 XAF, a short carry — they clear 600 for a trip across
 * Yaoundé after midnight. Raising the published price to improve that is the
 * one move this product has decided against: the price list is the argument
 * against a taxi, and it only works because it is quotable and small.
 *
 * A tip is the only line that raises what a rider earns without raising what is
 * advertised. It is offered, never assumed.
 *
 * ## The four rules it is built to
 *
 * **All of it goes to the rider.** A tip is not revenue and does not pass
 * through `splitEarnings`. The company's share of a tip is zero, asserted in
 * `verify-tip`, because the first time it is 40% the feature is a fraud.
 *
 * **It is never presented as making up a shortfall.** No copy anywhere may
 * imply the rider is underpaid without one, or that the delivery depends on it.
 * That framing shifts the employer's job onto the customer, and it is the
 * reason tipping is resented where it is resented. Ours says thank you and
 * nothing else.
 *
 * **Cash and mobile money are different mechanics, and both are honest.**
 * On a mobile-money order the tip rides the payment we already take and we owe
 * it onward at settlement. On a cash order the customer hands it over at the
 * door — so it is added to what the rider collects and then not owed back.
 * Either way the rider ends up with the whole of it; the difference is only who
 * is holding it in the meantime.
 *
 * **A mis-tap cannot cost somebody a week's money.** The amount is clamped, in
 * one place, on the server as well as in the chooser.
 */

/**
 * The offered amounts, in XAF.
 *
 * Chosen against what a rider actually clears rather than as round percentages:
 * 200 is a third of the 600 they make on the cheapest band, 500 doubles it,
 * 1,000 is what somebody sends after a rider has done something unusual — found
 * a pharmacy open at three, waited out a rainstorm. Percentages of a 1,500 fee
 * would produce 150/225/300, which is not money anybody hands over.
 */
export const TIP_PRESETS_XAF = [0, 200, 500, 1000] as const;

/**
 * The most a tip may be.
 *
 * Not a judgement about generosity — it is the guard against a stray digit.
 * 10,000 XAF is several times the largest delivery fee on the list, so anything
 * above it is far more likely to be a typo than a decision, and the customer
 * can always hand a rider more in person.
 */
export const MAX_TIP_XAF = 10_000;

/** Whatever arrived, as an amount that can safely be stored and charged. */
export function clampTip(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_TIP_XAF, Math.max(0, Math.round(n)));
}

/**
 * Where the tip physically sits between the door and settlement.
 *
 * `"rider_holds_cash"` — a cash order: the customer hands it over, the rider
 * already has it, and nothing about it passes through our account.
 * `"we_owe_rider"` — a mobile-money order: it came to us with the fee and we
 * pay it onward.
 *
 * Returned as a named case rather than a boolean so the copy on both sides can
 * say the true thing. "Added to your payment" and "give it to them at the door"
 * are different sentences and a customer notices when the wrong one is used.
 */
export type TipCustody = "none" | "rider_holds_cash" | "we_owe_rider";

export function tipCustody(tipXaf: number, paymentMethod: string): TipCustody {
  if (clampTip(tipXaf) <= 0) return "none";
  return paymentMethod === "CASH" ? "rider_holds_cash" : "we_owe_rider";
}

/**
 * What the rider receives from a tip. All of it.
 *
 * A function rather than a bare identity so that the rule has somewhere to live
 * and something to test. Anyone who later wants the company to take a cut has
 * to edit this line, and `verify-tip` will stop them.
 */
export function riderTipShareXaf(tipXaf: number): number {
  return clampTip(tipXaf);
}
