"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";

/**
 * The secondary half of an order form, folded away by default.
 *
 * The forms asked for everything at once — vendor, both locations, items,
 * preferences, a delivery time, a budget, toggles, instructions, a voice note —
 * in one long column. Uber and Yango feel fast because the first screen only
 * asks what they cannot proceed without, and everything optional waits behind
 * a tap. Same fields, same submitted order; just not all shouting at once.
 *
 * Deliberately a native `<details>`: it needs no state, it is keyboard and
 * screen-reader accessible for free, and — the part that matters here — fields
 * inside a closed `<details>` are still mounted and still submitted, so nothing
 * a customer typed can be lost by collapsing it, and validation still sees it.
 */
export function MoreDetails({
  accent,
  fr,
  children,
  /** Set when something inside needs attention, so it opens rather than hides an error. */
  open = false,
  label,
}: {
  accent: string;
  fr: boolean;
  children: React.ReactNode;
  open?: boolean;
  label?: string;
}) {
  return (
    <details open={open} className="group rounded-2xl border border-ink-700 bg-ink-900/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-mist-200">
          <SlidersHorizontal className="h-4 w-4" style={{ color: accent }} />
          {label ?? (fr ? "Ajouter des détails" : "Add details")}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-mist-500">
          {fr ? "optionnel" : "optional"}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-ink-800 px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}
