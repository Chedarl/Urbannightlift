"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Square } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { OperatingMode } from "@prisma/client";

export function OperatingModeControls({ mode }: { mode: OperatingMode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(mode);

  async function setMode(next: OperatingMode) {
    setCurrent(next);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    startTransition(() => router.refresh());
  }

  const buttons: { mode: OperatingMode; label: string; icon: React.ElementType; tone: string }[] = [
    { mode: "OPEN", label: t("admin.dashboard.openOps"), icon: Play, tone: "safe" },
    { mode: "PAUSED", label: t("admin.dashboard.pauseOps"), icon: Pause, tone: "caution" },
    { mode: "CLOSED", label: t("admin.dashboard.closeOps"), icon: Square, tone: "restricted" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map(({ mode: m, label, icon: Icon, tone }) => {
        const active = current === m;
        return (
          <button
            key={m}
            type="button"
            disabled={pending}
            onClick={() => setMode(m)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
              active
                ? tone === "safe"
                  ? "border-safe bg-safe/15 text-safe"
                  : tone === "caution"
                    ? "border-caution bg-caution/15 text-caution"
                    : "border-restricted bg-restricted/15 text-restricted"
                : "border-ink-700 bg-ink-800 text-mist-500 hover:text-mist-300"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        );
      })}
    </div>
  );
}
