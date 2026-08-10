"use client";

import { useEffect, useState } from "react";
import { loadDraft } from "@/lib/orders/draft";
import type { ServiceType } from "@prisma/client";

/**
 * The half of "just tell us what you need" that was never built.
 *
 * ## The bug, stated plainly
 *
 * `QuickIntake` read a sentence into a draft, saved it, and pushed the customer
 * at `/order/new?service=X&from=intake`. And **no order form has ever read a
 * draft.** `loadDraft()` had exactly one importer in the whole codebase —
 * `OrderReview`, which reads the draft the form itself just wrote. So the
 * sentence was parsed, stored, and thrown away one navigation later: the
 * customer typed *"two pizzas from Dolcezza to Bastos"*, watched a spinner, and
 * landed on a blank form. The feature could not have worked on any day since it
 * shipped.
 *
 * This is the missing read.
 *
 * ## The two rules that keep it from being worse than nothing
 *
 * 1. **It only ever fills an empty box.** Every value here is applied through
 *    `fill()`, which refuses to overwrite anything the customer has already
 *    typed. A prefill that clobbers real typing is a bug an order carries all
 *    the way to a rider; a prefill that quietly declines is invisible.
 *
 * 2. **It never invents a place.** An address is not a string in this product —
 *    it is a `SelectedLocation` with coordinates, a zone and a tier, and the fee
 *    is computed from it. A model reading "to Bastos" gives us a *word*, and
 *    turning that word into a location object would mean inventing coordinates
 *    and a zone, which is inventing a price. So the address arrives as a
 *    **suggestion**: the picker offers "Bastos" as a one-tap search, and the
 *    customer confirms an actual place exactly as they always have.
 *
 * Everything else in the product still applies unchanged — the form still
 * validates, the fee is still computed from the confirmed pins, the terms box is
 * still unticked, and `POST /api/orders` still prices the order itself.
 */

export interface IntakePrefill {
  itemDescription: string;
  /** A word, not a place. Offered to the picker as a search, never as a value. */
  pickupSuggestion: string;
  deliverySuggestion: string;
  notes: string;
  quantity: number;
}

const EMPTY: IntakePrefill = {
  itemDescription: "",
  pickupSuggestion: "",
  deliverySuggestion: "",
  notes: "",
  quantity: 1,
};

/**
 * What the customer's sentence produced, if they arrived from the intake box.
 *
 * Returns `null` on any other route in — tapping a service tile, a saved link, a
 * reorder — so a draft left over from a previous order can never bleed into a
 * form somebody opened fresh. The `from=intake` marker in the URL is what
 * distinguishes the two, and it is the only thing that does.
 *
 * @param serviceType Which form is asking. A draft for a different service is
 *   ignored: the customer changed their mind between the box and the form, and
 *   pouring food fields into a parcel form would be worse than an empty one.
 */
export function useIntakePrefill(serviceType: ServiceType): IntakePrefill | null {
  const [prefill, setPrefill] = useState<IntakePrefill | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("from") !== "intake") return;

    const draft = loadDraft();
    if (!draft || draft.serviceType !== serviceType) return;

    setPrefill({
      itemDescription: text(draft.itemDescription),
      pickupSuggestion: text(draft.pickupLocation),
      deliverySuggestion: text(draft.deliveryLocation),
      notes: text(draft.specialInstructions),
      quantity: Number.isFinite(draft.quantity) && draft.quantity > 0 ? draft.quantity : 1,
    });
    // Once, on mount. A re-run after the customer has started typing is exactly
    // the case rule 1 exists to prevent, and not re-running is cheaper than
    // relying on the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return prefill;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 300) : "";
}

/**
 * Whether a field is still empty, and therefore safe to fill.
 *
 * Every prefill in every form goes through this rather than assigning
 * directly, so rule 1 above is one function rather than a convention six
 * screens are each trusted to remember.
 */
export const blank = (v: unknown) => typeof v !== "string" || v.trim().length === 0;

/** `next` if the box is empty, otherwise whatever the customer typed. */
export function keepTyped(current: string, next: string): string {
  return blank(current) && next.length > 0 ? next : current;
}

/** Everything the intake gave us, folded into one line for a free-form field. */
export function asSentence(p: IntakePrefill): string {
  return [p.itemDescription, p.notes].filter((s) => s.length > 0).join(". ");
}
