"use client";

import { useEffect, useState } from "react";
import { ALL_PAYMENT_METHODS, type PaymentMethod } from "./methods";

/**
 * The ways of paying a customer may actually be offered.
 *
 * Every order form hardcoded `["CASH", "MTN_MOMO", "ORANGE_MONEY"]`, production
 * has no Orange merchant code, and the payment screen for an Orange order
 * rendered nothing at all — a blank page and an order that could not be paid.
 * The forms ask now instead of assuming.
 *
 * ## Why it starts optimistic and narrows
 *
 * It returns all three until the answer arrives, rather than starting empty.
 * A payment chooser that flashes into existence a beat after the rest of the
 * form is worse than one that settles: the customer has already looked at it
 * and moved on. Narrowing a moment later is a change they will not notice,
 * where an empty row they have already read past is one they will.
 *
 * If the request fails the list is left as it was. A settings endpoint that is
 * briefly unreachable must not take the payment options down with it — cash
 * always works, and a wrong offer is recoverable at the payment screen, which
 * now explains itself instead of rendering a blank.
 */
export function usePaymentMethods(): PaymentMethod[] {
  const [methods, setMethods] = useState<PaymentMethod[]>([...ALL_PAYMENT_METHODS]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        // Only trust a well-formed, non-empty list. An empty one would leave a
        // customer with no way to pay at all, which is never the right answer.
        if (Array.isArray(d.paymentMethods) && d.paymentMethods.length > 0) {
          setMethods(d.paymentMethods.filter((m: unknown): m is PaymentMethod =>
            (ALL_PAYMENT_METHODS as readonly string[]).includes(m as string)
          ));
        }
      })
      .catch(() => {
        /* leave the list as it is */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return methods;
}
