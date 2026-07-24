"use client";

import { Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** 3-step progress header: Details → Review → Checkout. */
export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const { t } = useTranslation();
  const steps = [t("steps.details"), t("steps.review"), t("steps.checkout")];

  return (
    <div className="mx-auto flex max-w-lg items-center gap-2 px-5 pt-4">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-safe bg-safe/20 text-safe",
                  active && "border-gold-400 bg-gold-400/15 text-gold-400",
                  !done && !active && "border-ink-700 text-mist-500"
                )}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </span>
              <span className={cn("text-xs font-medium", active ? "text-mist-100" : "text-mist-500")}>{label}</span>
            </div>
            {i < steps.length - 1 && <span className={cn("h-px flex-1", done ? "bg-safe/50" : "bg-ink-700")} />}
          </div>
        );
      })}
    </div>
  );
}
