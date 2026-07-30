"use client";

/**
 * Client-side draft order persistence between the form and review screens.
 * sessionStorage only — cleared once the order is submitted.
 */
import type { OrderInput } from "@/lib/validation/orderSchema";

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
