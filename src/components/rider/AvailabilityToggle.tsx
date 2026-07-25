"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "I'm working" / "I'm done".
 *
 * Dispatch had no way to tell who was actually out before assigning, so jobs
 * went to whoever was first in a list and then sat unanswered while everyone
 * assumed they were being handled. A rider taking ten seconds to say they've
 * finished is far cheaper than a delivery discovering it an hour later.
 */
export function AvailabilityToggle({ initialOnline }: { initialOnline: boolean }) {
  const router = useRouter();
  const [online, setOnline] = useState(initialOnline);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    const next = !online;
    setBusy(true);
    // Optimistic: the rider gets instant feedback, and a failed request rolls
    // it back rather than leaving them unsure which state they're in.
    setOnline(next);
    try {
      const res = await fetch("/api/rider/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: next }),
      });
      if (!res.ok) setOnline(!next);
      else startTransition(() => router.refresh());
    } catch {
      setOnline(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={cn(
        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors",
        online ? "border-safe/40 bg-safe/10" : "border-ink-700 bg-ink-900"
      )}
    >
      <span>
        <span className={cn("block text-sm font-semibold", online ? "text-safe" : "text-mist-300")}>
          {online ? "You're online" : "You're offline"}
        </span>
        <span className="block text-xs text-mist-500">
          {online ? "Dispatch can send you deliveries." : "Tap when you start your shift."}
        </span>
      </span>
      <Power className={cn("h-5 w-5", online ? "text-safe" : "text-mist-500")} />
    </button>
  );
}
