"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import {
  ASAP,
  buildTimeSlots,
  formatHour,
  formatSlot,
  isSlotPast,
} from "@/lib/orders/timeSlots";

/**
 * When the customer wants it — as a time, not a sentence.
 *
 * Every order form used to ask this with a text box and a placeholder like
 * "e.g. Tonight, 10:30 PM", so people typed phrases. Dispatch then had prose
 * where a time should be, and nothing kept the answer inside the hours we
 * actually trade. This offers the operating window itself: "as soon as
 * possible" first, then real half-hour slots, with the ones already gone
 * disabled.
 *
 * The window comes from the live operating settings rather than a constant, so
 * changing the hours in admin changes what customers can ask for.
 */

const DEFAULT_START = 18;
const DEFAULT_END = 4;

export function DeliveryTimeField({
  value,
  onChange,
  accent,
  fr,
  label,
  className = "",
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  accent: string;
  fr: boolean;
  label?: string;
  className?: string;
}) {
  const [startHour, setStartHour] = useState(DEFAULT_START);
  const [endHour, setEndHour] = useState(DEFAULT_END);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.operatingStartHour === "number") setStartHour(d.operatingStartHour);
        if (typeof d.operatingEndHour === "number") setEndHour(d.operatingEndHour);
      })
      .catch(() => {
        // Defaults already describe the published hours; a failed settings call
        // must never leave the customer without a way to answer.
      });
  }, []);

  const slots = buildTimeSlots(startHour, endHour);
  const current = value && value.length > 0 ? value : ASAP;
  // An older order or a saved draft may hold free text. Keep it selectable so
  // reordering doesn't silently rewrite what the customer asked for.
  const legacy = current !== ASAP && !slots.includes(current) ? current : null;

  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-mist-400">
        <Clock className="h-3.5 w-3.5" style={{ color: accent }} />
        {label ?? (fr ? "Heure de ramassage souhaitée" : "Preferred pickup time")}
      </p>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 focus:outline-none"
        style={{ borderColor: current !== ASAP ? accent : undefined }}
      >
        <option value={ASAP}>{formatSlot(ASAP, fr)}</option>
        {legacy && <option value={legacy}>{legacy}</option>}
        {slots.map((s) => (
          <option key={s} value={s} disabled={isSlotPast(s, startHour, endHour)}>
            {formatSlot(s, fr)}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-mist-500">
        {fr
          ? `Nous livrons de ${formatHour(startHour, true)} à ${formatHour(endHour, true)}.`
          : `We deliver from ${formatHour(startHour, false)} to ${formatHour(endHour, false)}.`}
      </p>
    </div>
  );
}
