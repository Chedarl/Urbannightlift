"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { CUSTOMER_TIMELINE, type CustomerStatusKey } from "@/lib/orders/statusLabels";
import { cn } from "@/lib/utils";

/**
 * The order timeline, ticking itself off as each step actually happens.
 *
 * It used to be rendered once on the server with a "Refresh status" button
 * underneath, so a customer watching their delivery saw a frozen list until
 * they thought to tap it — on a night delivery that reads as nothing
 * happening. Each step now ticks when it is reached, shows the time it
 * happened, and the live step animates so it is obvious the page is watching.
 *
 * The last step is deliberately not complete until the customer confirms
 * receipt: we can say we delivered, only they can say they received.
 */

interface Step {
  key: CustomerStatusKey;
  done: boolean;
  current: boolean;
  at: string | null;
}

const POLL_MS = 10_000;

function timeOf(iso: string | null, fr: boolean): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(fr ? "fr-FR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LiveTimeline({
  orderCode,
  initialSteps,
  cancelled,
  confirmedAt: initialConfirmedAt,
  fr,
}: {
  orderCode: string;
  initialSteps: Step[];
  cancelled: boolean;
  confirmedAt: string | null;
  fr: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initialConfirmedAt);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (cancelled) return;
    let alive = true;

    async function poll() {
      try {
        const res = await fetch(`/api/track/${orderCode}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (!data.found || !alive) return;

        // A step changing means something happened that the rest of the page
        // (payment card, confirmation box, receipt) also needs to know about.
        const moved =
          JSON.stringify(data.steps) !== JSON.stringify(steps) ||
          data.customerConfirmedAt !== confirmedAt;

        setSteps(data.steps);
        setConfirmedAt(data.customerConfirmedAt ?? null);
        setCheckedAt(new Date());
        if (moved) router.refresh();
      } catch {
        // Offline or a flaky connection — keep the last known state on screen
        // rather than blanking a timeline someone is relying on.
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderCode, cancelled, steps, confirmedAt, router]);

  if (cancelled) {
    return <p className="text-sm font-medium text-restricted">{t("customerStatus.cancelled")}</p>;
  }

  return (
    <>
      <ol className="flex flex-col gap-0">
        {steps.map((step, i) => {
          const isLast = i === CUSTOMER_TIMELINE.length - 1;
          // "Delivered" only completes when the customer has confirmed it.
          const done = isLast ? step.done || confirmedAt != null : step.done;
          const current = step.current && !done;
          const at = timeOf(step.at, fr);

          return (
            <li key={step.key} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-xs transition-colors",
                    done && "border-safe bg-safe/20 text-safe",
                    current && "border-gold-400 bg-gold-400/15 text-gold-400",
                    !done && !current && "border-ink-700 text-mist-500"
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : current ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    i + 1
                  )}
                </span>
                {!isLast && <span className={cn("h-5 w-px", done ? "bg-safe/50" : "bg-ink-700")} />}
              </div>

              <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 pt-0.5">
                <span
                  className={cn(
                    "text-sm",
                    current ? "font-semibold text-gold-300" : done ? "text-mist-300" : "text-mist-500"
                  )}
                >
                  {t(`customerStatus.${step.key}`)}
                  {isLast && confirmedAt && (
                    <span className="ml-1.5 text-xs text-safe">
                      · {fr ? "réception confirmée" : "receipt confirmed"}
                    </span>
                  )}
                </span>
                {at && <span className="text-xs tabular-nums text-mist-500">{at}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-mist-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-safe" />
        {fr ? "Mise à jour automatique" : "Updating automatically"}
        {checkedAt && ` · ${timeOf(checkedAt.toISOString(), fr)}`}
      </p>
    </>
  );
}
