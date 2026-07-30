"use client";

import { useState } from "react";
import { Star, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How did it go?
 *
 * Uber and DoorDash both close a delivery by asking, once, right after it
 * lands — and it is the only honest read of whether a night went well. It sits
 * on the goodbye screen after the goods are in hand, never before. One to five
 * stars; a comment is optional. Asked once: after it is sent, it becomes a
 * quiet thank-you rather than an editable form.
 */
export function RateDelivery({
  orderCode,
  initialStars,
  fr,
}: {
  orderCode: string;
  /** Already rated? Then this is a read-only thank-you. */
  initialStars: number | null;
  fr: boolean;
}) {
  const [hover, setHover] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(initialStars != null);
  const [saved, setSaved] = useState(initialStars ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(value: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${orderCode}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: value, comment }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(typeof d.error === "string" ? d.error : fr ? "Réessayez." : "Try again.");
        return;
      }
      setSaved(value);
      setDone(true);
    } catch {
      setError(fr ? "Réessayez." : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-safe/30 bg-safe/[0.05] p-4 text-center">
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-safe">
          <Check className="h-4 w-4" /> {fr ? "Merci pour votre retour" : "Thanks for the feedback"}
        </p>
        <div className="mt-2 flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("h-5 w-5", n <= saved ? "fill-gold-400 text-gold-400" : "text-ink-700")} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4 text-center">
      <p className="text-sm font-semibold text-mist-100">{fr ? "Comment s'est passée cette nuit ?" : "How was tonight?"}</p>
      <div className="mt-3 flex justify-center gap-2" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setStars(n)}
            className="transition-transform active:scale-90"
          >
            <Star
              className={cn(
                "h-8 w-8 transition-colors",
                n <= (hover || stars) ? "fill-gold-400 text-gold-400" : "text-ink-600"
              )}
            />
          </button>
        ))}
      </div>

      {stars > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={fr ? "Un mot pour nous (facultatif)" : "A word for us (optional)"}
            className="w-full rounded-xl border border-ink-700 bg-ink-950 p-2.5 text-sm text-mist-100 placeholder:text-mist-600 focus:border-gold-400/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => send(stars)}
            className="rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-bold text-ink-950 hover:bg-gold-300 disabled:opacity-60"
          >
            {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}
    </div>
  );
}
