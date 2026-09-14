"use client";

import { Check, Lock, Ban, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JourneyStage as Stage } from "@/lib/orders/customerJourney";

/**
 * One stage of the customer's night.
 *
 * A finished stage is a single green line — what happened, at what time — and
 * its controls are gone, not greyed out. A locked stage is a name and a reason
 * it is shut. Only the live stage has anything to touch.
 *
 * This is deliberately the same shape as the dispatch console's `WorkflowStep`,
 * because the customer and the dispatcher are looking at the same order and
 * should recognise the same thing when they compare screens on a phone call.
 */
export function JourneyStage({
  stage,
  fr,
  children,
}: {
  stage: Stage;
  fr: boolean;
  children?: React.ReactNode;
}) {
  const { state, turn } = stage;
  const done = state === "DONE";
  const active = state === "ACTIVE";
  const locked = state === "LOCKED";
  const stopped = state === "STOPPED";

  // A finished stage is a line, not a card. Five of them stacked above the live
  // one has to read as a receipt of the evening, not as five more things to do.
  if (done) {
    return (
      <div className="flex items-start gap-2.5 px-1">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-safe/20 text-safe">
          <Check className="h-3 w-3" />
        </span>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-mist-400">
          <span className="font-medium text-mist-300">{stage.title}</span>
          {stage.proof && <span className="text-mist-500"> · {stage.proof}</span>}
        </p>
      </div>
    );
  }

  if (locked || stopped) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-ink-800 bg-ink-950/50 px-3 py-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-mist-600">
          {stopped ? <Ban className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
        </span>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-mist-500">
          <span className="font-medium">{stage.title}</span>
          <span className="block text-mist-600">
            {stopped
              ? fr
                ? "Cette commande a été arrêtée avant cette étape."
                : "This order was stopped before this stage."
              : stage.blockedBy}
          </span>
        </p>
      </div>
    );
  }

  // Live. One card, one headline, and whatever there is to do.
  return (
    <section
      className={cn(
        "rounded-2xl border p-4",
        active && turn === "YOURS"
          ? "border-gold-400/50 bg-gradient-to-b from-gold-400/[0.07] to-transparent"
          : "border-violet-500/35 bg-violet-950/20"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-mist-500">
          {fr ? `Étape ${stage.number} sur 5` : `Step ${stage.number} of 5`}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
            turn === "YOURS" ? "bg-gold-400/15 text-gold-300" : "bg-violet-500/15 text-violet-300"
          )}
        >
          {turn === "YOURS"
            ? fr
              ? "À vous de jouer"
              : "Over to you"
            : fr
              ? "Nous nous en occupons"
              : "We're on it"}
        </span>
      </div>

      <h2 className="mt-2 font-display text-lg font-bold leading-snug text-mist-100">
        {stage.headline}
      </h2>

      {stage.waitHint && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-mist-400">
          <Clock className="h-3.5 w-3.5 shrink-0" /> {stage.waitHint}
        </p>
      )}

      {children && <div className="mt-4 flex flex-col gap-4">{children}</div>}
    </section>
  );
}
