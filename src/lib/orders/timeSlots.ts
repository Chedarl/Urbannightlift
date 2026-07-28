/**
 * The times a customer may ask for, as actual times.
 *
 * The field behind this used to be free text, so people wrote "tonight around
 * ten-ish" and dispatch had to read prose and guess. A delivery window that
 * cannot be sorted cannot be planned, and nothing stopped someone asking for
 * 2 PM on a service that only trades from 6 PM. Everything here works in
 * canonical 24-hour "HH:MM" (or the literal "ASAP") and is only turned into
 * words at the moment it is shown.
 */

import { yaoundeHour } from "@/lib/orders/tonight";

export const ASAP = "ASAP";

/** Canonical stored forms: "ASAP" or a zero-padded 24-hour time. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCanonicalTime(value: string): boolean {
  return value === ASAP || TIME_RE.test(value);
}

/**
 * Every slot in the operating night, e.g. 18:00 → 04:00 in half hours.
 * The window wraps past midnight, which is the normal case here, so the walk is
 * done in minutes from the opening hour rather than on the clock itself.
 */
export function buildTimeSlots(startHour: number, endHour: number, stepMinutes = 30): string[] {
  const span = nightLengthMinutes(startHour, endHour);
  const slots: string[] = [];
  for (let offset = 0; offset <= span; offset += stepMinutes) {
    const minutes = (startHour * 60 + offset) % 1440;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}

/** Length of the operating night in minutes; equal hours means round the clock. */
export function nightLengthMinutes(startHour: number, endHour: number): number {
  const diff = (endHour - startHour + 24) % 24;
  return (diff === 0 ? 24 : diff) * 60;
}

/** Minutes since opening, so a wrapped night still compares in order. */
export function slotOffsetMinutes(value: string, startHour: number): number {
  const [h, m] = value.split(":").map(Number);
  return (h * 60 + m - startHour * 60 + 1440) % 1440;
}

/**
 * Whether a slot has already gone by, judged in Yaoundé time.
 *
 * The server runs in UTC and Cameroon is UTC+1, so using the process clock here
 * would grey out slots that are still an hour away — the same class of mistake
 * that once hid whole orders from the dispatch board.
 */
export function isSlotPast(
  value: string,
  startHour: number,
  endHour: number,
  now: Date = new Date()
): boolean {
  if (value === ASAP) return false;
  const nowMinutes = yaoundeHour(now) * 60 + yaoundeMinute(now);
  const nowOffset = (nowMinutes - startHour * 60 + 1440) % 1440;
  // Outside the operating window entirely (e.g. someone ordering at midday for
  // tonight): the whole night is still ahead, so nothing is past.
  if (nowOffset > nightLengthMinutes(startHour, endHour)) return false;
  return slotOffsetMinutes(value, startHour) < nowOffset;
}

/** The wall-clock minute in Yaoundé, matching yaoundeHour(). */
export function yaoundeMinute(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { minute: "numeric", timeZone: "Africa/Douala" }).format(now)
  );
}

/** "22:30" → "10:30 PM" / "22h30"; "ASAP" → the localized phrase. */
export function formatSlot(value: string | null | undefined, fr: boolean): string {
  if (!value) return "";
  if (value === ASAP) return fr ? "Dès que possible" : "As soon as possible";
  if (!TIME_RE.test(value)) return value; // legacy free text — show what they wrote
  const [h, m] = value.split(":").map(Number);
  if (fr) return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Just the hour, for the "we trade from … to …" line under the field. */
export function formatHour(hour: number, fr: boolean): string {
  return formatSlot(`${String(hour).padStart(2, "0")}:00`, fr);
}

/**
 * What the server stores. Canonical values pass through; anything else is kept
 * verbatim rather than rejected, so a saved draft or a reordered old order from
 * before this field was structured still submits instead of failing validation
 * at the last step.
 */
export function normalizePreferredTime(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (raw.toUpperCase() === ASAP) return ASAP;
  const padded = /^\d:\d\d$/.test(raw) ? `0${raw}` : raw;
  if (TIME_RE.test(padded)) return padded;
  return raw.slice(0, 100);
}
