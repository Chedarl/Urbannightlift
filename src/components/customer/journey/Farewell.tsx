"use client";

import { Moon } from "lucide-react";

/**
 * The ending.
 *
 * A delivery used to just stop — the confirm button turned into a tick, and
 * that was the whole of it. Nothing marked the moment, nothing thanked anybody,
 * and the last thing a customer saw at 1 AM was a form that had gone quiet.
 *
 * Every operator worth copying spends a screen on this. DoorDash draws a tick
 * and names the courier; Uber thanks you and asks how it went. It costs
 * nothing, it is the last thing anybody remembers, and it is the difference
 * between a transaction ending and a night ending well.
 *
 * The tick draws itself, a ring pushes out behind it, then the words rise in —
 * about a second in total. Under `prefers-reduced-motion` it simply appears.
 */
export function Farewell({
  name,
  nthNight,
  riderName,
  deliveredAt,
  fr,
  children,
}: {
  /** Their real name if we have one — a thank-you with a name in it is a different thing. */
  name: string | null;
  /** Which night of theirs this was. Null for a first-timer, who gets a welcome instead. */
  nthNight: number | null;
  riderName: string | null;
  deliveredAt: string | null;
  fr: boolean;
  /** Rating, reorder, save-this-address — offered after the thank-you, never before. */
  children?: React.ReactNode;
}) {
  const clock = deliveredAt
    ? new Date(deliveredAt).toLocaleTimeString(fr ? "fr-FR" : "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const first = nthNight == null || nthNight <= 1;
  const greeting = name
    ? fr
      ? `Merci, ${name}.`
      : `Thank you, ${name}.`
    : fr
      ? "Merci."
      : "Thank you.";

  const line = first
    ? fr
      ? "Votre première nuit avec nous est terminée. Nous espérons vous revoir bientôt."
      : "That's your first night with us done. We hope to see you again soon."
    : fr
      ? `C'était votre ${nthNight}ᵉ nuit avec nous.`
      : `That was your ${ordinal(nthNight!)} night with us.`;

  return (
    <section className="overflow-hidden rounded-3xl border border-safe/30 bg-gradient-to-b from-safe/[0.10] via-violet-950/20 to-transparent px-5 py-8 text-center">
      <div className="relative mx-auto h-20 w-20">
        <span className="animate-ring-out absolute inset-0 rounded-full border-2 border-safe" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-safe/15">
          <svg viewBox="0 0 32 32" className="h-10 w-10" aria-hidden="true">
            <path
              d="M7 16.5 L13.5 23 L25 10"
              fill="none"
              stroke="var(--color-safe)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="32"
              className="animate-draw-check"
            />
          </svg>
        </span>
      </div>

      <h2
        className="animate-rise-in mt-5 font-display text-2xl font-bold text-mist-100"
        style={{ animationDelay: "0.5s" }}
      >
        {greeting}
      </h2>
      <p className="animate-rise-in mt-1.5 text-sm text-mist-300" style={{ animationDelay: "0.62s" }}>
        {line}
      </p>

      {(clock || riderName) && (
        <p className="animate-rise-in mt-3 text-xs text-mist-500" style={{ animationDelay: "0.74s" }}>
          {fr ? "Livré" : "Delivered"}
          {clock ? ` ${fr ? "à" : "at"} ${clock}` : ""}
          {riderName ? ` ${fr ? "par" : "by"} ${riderName}` : ""}
        </p>
      )}

      <p
        className="animate-rise-in mt-5 flex items-center justify-center gap-1.5 text-xs font-medium text-violet-300"
        style={{ animationDelay: "0.86s" }}
      >
        <Moon className="h-3.5 w-3.5" />
        {fr ? "Rentrez bien. La nuit est à nous." : "Get home safe. The night is ours."}
      </p>

      {children && (
        <div className="animate-rise-in mt-6 flex flex-col gap-4 text-left" style={{ animationDelay: "0.98s" }}>
          {children}
        </div>
      )}
    </section>
  );
}

/** 1st, 2nd, 3rd, 4th — including the 11th–13th, which do not follow the rule. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
