"use client";

import { cn } from "@/lib/utils";
import type { JourneyStage } from "@/lib/orders/customerJourney";

/**
 * How far along the night is, in one glance.
 *
 * Five segments rather than a bulleted list, because the list belongs further
 * down as history and this belongs at the top as orientation. The live segment
 * pulses so it is obvious the page is watching rather than frozen — the single
 * thing a customer most wants to know while waiting.
 */
export function JourneyProgress({
  stages,
  fr,
}: {
  stages: JourneyStage[];
  fr: boolean;
}) {
  const done = stages.filter((s) => s.state === "DONE").length;
  const stopped = stages.some((s) => s.state === "STOPPED");

  return (
    <div>
      <div className="flex gap-1.5" role="img" aria-label={fr ? `Étape ${done + 1} sur ${stages.length}` : `Step ${done + 1} of ${stages.length}`}>
        {stages.map((s) => (
          <span
            key={s.key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500",
              s.state === "DONE" && "bg-safe",
              s.state === "ACTIVE" && "animate-pulse bg-gold-400",
              s.state === "LOCKED" && "bg-ink-800",
              s.state === "STOPPED" && "bg-ink-800"
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-mist-500">
        {stopped
          ? fr
            ? "Cette commande a été arrêtée."
            : "This order was stopped."
          : done === stages.length
            ? fr
              ? "Terminé — merci."
              : "All done — thank you."
            : fr
              ? `${done} étape${done === 1 ? "" : "s"} sur ${stages.length} terminée${done === 1 ? "" : "s"}`
              : `${done} of ${stages.length} steps done`}
      </p>
    </div>
  );
}
