"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsRight, Loader2 } from "lucide-react";

/**
 * Drag, don't tap, to commit.
 *
 * ## Why a slide and not a button
 *
 * This is the control that spends somebody's money at one in the morning, on a
 * phone, one-handed, usually while walking. A tap is a single unintended muscle
 * twitch away, and the recovery path for an accidental order is a phone call to
 * dispatch and a rider already on a bike.
 *
 * A drag cannot be produced by accident. It also takes about a second, which is
 * the point: it is the only second in the flow where the total is on screen and
 * nothing else is competing for attention.
 *
 * ## The two ways this is usually got wrong
 *
 * **It is not only a drag.** A slider that responds to nothing but a pointer
 * drag is unusable with a screen reader, a keyboard, or a switch — and in this
 * product that is not a hypothetical population, it is the customer whose phone
 * is in one hand and whose other hand is holding a gate open. So the track is a
 * real `<button>`: Enter and Space confirm it directly, and the drag is an
 * enhancement layered over a control that already worked. `role="slider"` would
 * describe the mechanic and hide the action; the action is what matters.
 *
 * **It does not fire twice.** Pointer capture plus an `armed` latch means a
 * release past the threshold commits exactly once, and the component goes inert
 * the moment it has. The submit path behind it creates an order.
 *
 * `prefers-reduced-motion` is honoured by `globals.css` for the transition; the
 * mechanic itself is unchanged, because it is a safety measure rather than a
 * flourish.
 */

export interface SlideToConfirmProps {
  label: string;
  /** Shown once committed, while the caller does its work. */
  busyLabel: string;
  /** Shown in place of everything when the caller is done. */
  doneLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  busy?: boolean;
  done?: boolean;
  /** Tailwind classes for the moving knob and the filled track. */
  tone?: "gold" | "violet";
}

/** How far along the track a release commits. Below it, the knob springs back. */
const COMMIT_AT = 0.86;

const TONES = {
  gold: { knob: "bg-gold-400 text-ink-950", fill: "bg-gold-400/20", ring: "border-gold-400/40" },
  violet: { knob: "bg-violet-500 text-white", fill: "bg-violet-500/20", ring: "border-violet-400/40" },
} as const;

export function SlideToConfirm({
  label,
  busyLabel,
  doneLabel,
  onConfirm,
  disabled = false,
  busy = false,
  done = false,
  tone = "gold",
}: SlideToConfirmProps) {
  const trackRef = useRef<HTMLButtonElement>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  /*
    True from the instant we commit until the component unmounts. `busy` comes
    back from the parent a render later, and that gap is long enough for a
    second pointerup to land.
  */
  const armed = useRef(true);

  const inert = disabled || busy || done;

  const commit = useCallback(() => {
    if (!armed.current) return;
    armed.current = false;
    setProgress(1);
    onConfirm();
  }, [onConfirm]);

  // A parent that hands back a fresh chance — a failed submit, say — re-arms it.
  useEffect(() => {
    if (!busy && !done) armed.current = true;
  }, [busy, done]);

  const travel = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    // The knob is 3rem and centred on the pointer, so the usable travel is the
    // track minus the knob. Without this the slider can never reach 1.
    const usable = Math.max(1, r.width - 48);
    return Math.min(1, Math.max(0, (clientX - r.left - 24) / usable));
  }, []);

  return (
    <button
      ref={trackRef}
      type="button"
      disabled={inert}
      aria-busy={busy || undefined}
      onClick={(e) => {
        /*
          The keyboard path, and *only* the keyboard path.

          The first version of this guarded on `!dragging`, which does not work:
          `click` is dispatched after `pointerup`, by which time the pointerup
          handler has already set `dragging` to false. So a short drag — the
          one that is supposed to spring back — fell through to the click and
          placed the order anyway. Verified: an 40%-of-the-way drag submitted.
          The safety measure was not measuring anything.

          `detail` is the discriminator. A click synthesised by Enter or Space
          on a button carries `detail === 0`; a click produced by a pointer
          carries at least 1. So the keyboard confirms, a tap does nothing, and
          the pointer's only way through is the drag — which is the entire
          point of the control.
        */
        if (inert) return;
        if (e.detail !== 0) return;
        commit();
      }}
      onPointerDown={(e) => {
        if (inert) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        setProgress(travel(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!dragging || inert) return;
        setProgress(travel(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        setDragging(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        if (travel(e.clientX) >= COMMIT_AT) commit();
        else setProgress(0);
      }}
      onPointerCancel={() => {
        setDragging(false);
        setProgress(0);
      }}
      className={`relative h-14 w-full touch-none select-none overflow-hidden rounded-pill border ${
        TONES[tone].ring
      } bg-ink-900/80 disabled:opacity-60`}
    >
      {/* The filled part of the track, behind everything. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 ${TONES[tone].fill} ${dragging ? "" : "transition-[width] duration-200"}`}
        style={{ width: `${Math.round(progress * 100)}%` }}
      />

      <span className="pointer-events-none relative flex h-full items-center justify-center px-14 text-center font-display text-sm font-bold text-mist-200">
        {done ? (
          <span className="flex items-center gap-2 text-safe">
            <Check className="h-4 w-4" /> {doneLabel ?? label}
          </span>
        ) : busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}
          </span>
        ) : (
          label
        )}
      </span>

      {/* The knob. Hidden once committed so the label owns the whole track. */}
      {!busy && !done && (
        <span
          aria-hidden
          className={`absolute top-1 flex h-12 w-12 items-center justify-center rounded-full ${
            TONES[tone].knob
          } ${dragging ? "" : "transition-[left] duration-200"}`}
          style={{ left: `calc(0.25rem + ${progress} * (100% - 3.5rem))` }}
        >
          <ChevronsRight className="h-5 w-5" />
        </span>
      )}
    </button>
  );
}
