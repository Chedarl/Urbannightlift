"use client";

import { useState } from "react";
import { Check, Lock, Ban, ChevronDown, ChevronUp, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepState } from "@/lib/orders/workflow";

/**
 * One step of the order, in the only three states it can hold.
 *
 * The console used to render every step's controls permanently, so a delivered,
 * paid, confirmed order still offered "Approve", "Update price" and "Assign
 * rider". Nothing on the screen told you what had actually been done, and the
 * work could be performed in any order.
 *
 * Now: a finished step collapses to a green line stating what happened and
 * when, and its controls are put away — reopening is a deliberate act, not a
 * button that never left. A locked step says what has to happen first and
 * cannot be opened at all. Exactly one step is ever live.
 */
export function WorkflowStep({
  number,
  title,
  purpose,
  state,
  proof,
  blockedBy,
  children,
  /** Offered on a finished step only where changing it afterwards is legitimate. */
  onReopen,
  reopenLabel = "Change this",
}: {
  number: number;
  title: string;
  purpose: string;
  state: StepState;
  proof: string | null;
  blockedBy: string | null;
  children: React.ReactNode;
  onReopen?: () => void;
  reopenLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = state === "DONE";
  const locked = state === "LOCKED";
  const stopped = state === "STOPPED";
  const active = state === "ACTIVE";

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        active && "border-gold-400/50 bg-ink-900",
        done && "border-safe/30 bg-safe/[0.04]",
        locked && "border-ink-800 bg-ink-950/60",
        stopped && "border-ink-800 bg-ink-950/40"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            active && "bg-gold-400 text-ink-950",
            done && "bg-safe text-ink-950",
            locked && "bg-ink-800 text-mist-500",
            stopped && "bg-ink-800 text-mist-600"
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3" /> : stopped ? <Ban className="h-3 w-3" /> : number}
        </span>

        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "flex flex-wrap items-center gap-2 font-display text-sm font-semibold",
              active && "text-gold-300",
              done && "text-safe",
              (locked || stopped) && "text-mist-500"
            )}
          >
            Step {number} · {title}
            {active && (
              <span className="inline-flex items-center gap-1 rounded-md bg-gold-400/15 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-gold-300">
                <CircleDot className="h-2.5 w-2.5" /> Do this now
              </span>
            )}
          </h2>

          {/* A finished step shows the evidence instead of the controls. */}
          {done && proof && <p className="mt-1 text-xs text-safe/90">{proof}</p>}
          {locked && <p className="mt-1 text-xs text-mist-500">{blockedBy ?? "Finish the step above first."}</p>}
          {stopped && <p className="mt-1 text-xs text-mist-500">This order was stopped before this step.</p>}
          {active && <p className="mt-1 text-xs text-mist-400">{purpose}</p>}
        </div>

        {done && (onReopen || children) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-lg border border-ink-700 px-2 py-1 text-xs text-mist-400 hover:text-mist-200"
          >
            {expanded ? (
              <span className="flex items-center gap-1">Hide <ChevronUp className="h-3 w-3" /></span>
            ) : (
              <span className="flex items-center gap-1">Details <ChevronDown className="h-3 w-3" /></span>
            )}
          </button>
        )}
      </div>

      {/* Controls appear only where they can legitimately be used. */}
      {active && <div className="mt-3">{children}</div>}

      {done && expanded && (
        <div className="mt-3 border-t border-ink-800 pt-3">
          <p className="mb-2 text-xs text-mist-500">
            This step is finished. Anything below changes a decision that has already been made.
          </p>
          {onReopen ? (
            <button
              type="button"
              onClick={onReopen}
              className="rounded-lg border border-gold-400/40 px-3 py-1.5 text-xs font-semibold text-gold-300 hover:bg-gold-400/10"
            >
              {reopenLabel}
            </button>
          ) : (
            <div className="opacity-60">{children}</div>
          )}
        </div>
      )}
    </section>
  );
}

/** A one-line readout of how far the order has got. */
export function WorkflowProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-safe transition-all"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-semibold text-mist-400">
        {done} of {total} done
      </span>
    </div>
  );
}
