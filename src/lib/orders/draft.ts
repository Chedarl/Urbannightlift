"use client";

/**
 * Client-side draft order persistence between the form and review screens.
 * sessionStorage only — cleared once the order is submitted.
 */
import type { OrderInput } from "@/lib/validation/orderSchema";
import type { FareLine } from "@/lib/orders/fare";

const DRAFT_KEY = "unl_order_draft";

export interface OrderDraft extends OrderInput {
  estimatedFeeXaf: number | null;
  pickupZoneName?: string;
  deliveryZoneName?: string;
  merchantName?: string;
  /**
   * Whether the fee is the zone tariff and therefore final, so the review
   * screen can say so instead of calling every price an estimate. Copy only —
   * the server re-decides authoritatively in `decideAutoPrice`, so a tampered
   * draft changes what the customer is *told*, never what they are charged.
   */
  priceFirm?: boolean;
  /**
   * How the delivery fee was arrived at — the minimum, the distance beyond it,
   * the zone modifier, any surcharge.
   *
   * Carried from the form rather than recomputed on the review screen, so the
   * working shown to the customer is provably the working behind the number
   * they were quoted. A second computation could disagree with the first, and
   * an explanation that disagrees with the price is worse than no explanation.
   *
   * Display only. `POST /api/orders` prices the order itself and never reads
   * this, so a tampered draft changes what somebody is *told*, never what they
   * are charged.
   */
  fareLines?: FareLine[];
  /** True when nothing was pinned and the fee is a zone-only approximation. */
  fareEstimated?: boolean;
}

export function saveDraft(draft: OrderDraft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): OrderDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OrderDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}
