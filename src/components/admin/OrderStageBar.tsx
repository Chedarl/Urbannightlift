"use client";

import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUSTOMER_STAGES, stageIndex, type Stage } from "@/lib/orders/dispatchRules";

/**
 * Where this order actually is, and what has to happen next.
 *
 * The order screen used to be a pile of panels in no particular sequence —
 * payment verification sat above pricing, so it taught the opposite of the
 * order the money follows, and a dispatcher had to hold the real sequence in
 * their head. This puts the sequence on the screen: six steps, the one you are
 * standing on, and the single thing blocking the next one.
 */

const NEXT_ACTION: Record<Stage, string> = {
  REVIEW: "Review it, then set a price and send the customer the link.",
  PRICED: "Waiting on the customer to accept the price.",
  ACCEPTED: "Waiting for payment. Verify it as soon as the proof arrives.",
  PAID: "Money is in — assign a rider.",
  DISPATCHED: "With the rider. They collect, deliver, and take the code.",
  DELIVERED: "Delivered. Settle the earnings and close it.",
  CLOSED: "Closed.",
  STOPPED: "This order is stopped — cancelled, rejected or on hold.",
};

export function OrderStageBar({ stage, blocker }: { stage: Stage; blocker: string | null }) {
  const stopped = stage === "STOPPED";
  const current = stageIndex(stage);

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <ol className="flex items-center gap-1">
        {CUSTOMER_STAGES.map((s, i) => {
          const done = !stopped && i < current;
          const here = !stopped && i === current;
          return (
            <li key={s.stage} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    done && "border-safe bg-safe/20 text-safe",
                    here && "border-gold-400 bg-gold-400 text-ink-950",
                    !done && !here && "border-ink-600 text-mist-500"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {i < CUSTOMER_STAGES.length - 1 && (
                  <span className={cn("h-0.5 flex-1", done ? "bg-safe/40" : "bg-ink-700")} />
                )}
              </div>
              <span
                className={cn(
                  "text-center text-xs leading-tight",
                  here ? "font-semibold text-gold-300" : done ? "text-mist-400" : "text-mist-500"
                )}
              >
                {s.en}
              </span>
            </li>
          );
        })}
      </ol>

      <p
        className={cn(
          "mt-3 rounded-xl px-3 py-2 text-xs",
          stopped
            ? "border border-restricted/40 bg-restricted/10 text-restricted"
            : blocker
              ? "border border-gold-400/30 bg-gold-400/5 text-gold-200"
              : "border border-safe/30 bg-safe/5 text-safe"
        )}
      >
        {blocker && !stopped ? (
          <>
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
            {blocker}
          </>
        ) : (
          NEXT_ACTION[stage]
        )}
      </p>
    </section>
  );
}
