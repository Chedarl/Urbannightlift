/**
 * The ways a person can reach a human at Urban Night Lift.
 *
 * These four strings were written out by hand in twenty files. Two of them are
 * one character apart and mean different things — the site is
 * **urbannigh**lift.com with a single `t`, the mailbox is
 * **urbannight**lift@gmail.com with two — which is precisely the sort of pair
 * that survives a careless find-and-replace in the wrong direction and sends a
 * customer's reply into the void.
 *
 * New code takes them from here. The twenty existing spellings are a separate
 * sweep, deliberately not folded into a design change: a blind replace across
 * them is how the two names get confused.
 */

/** Dispatch, in the form a `tel:` link wants. */
export const DISPATCH_TEL = "+237680038004";

/** The same number for `wa.me`, which takes no plus and no spaces. */
export const DISPATCH_WA = "237680038004";

/** How it is printed for a person to read or dial by hand. */
export const DISPATCH_DISPLAY = "+237 680 038 004";

/** The mailbox. Two `t`s — see above. */
export const SUPPORT_EMAIL = "urbannightlift@gmail.com";

/** The site. One `t` — see above. */
export const SITE_ORIGIN = "https://urbannighlift.com";
