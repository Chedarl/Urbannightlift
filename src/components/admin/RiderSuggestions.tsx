"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Zap } from "lucide-react";

interface Suggestion {
  riderId: string;
  fullName: string;
  isOnline: boolean;
  activeOrders: number;
  km: number | null;
  reasons: string[];
  reasonsFr: string[];
}

/**
 * Who should take this job, put in front of the person who decides.
 *
 * ## What this replaces
 *
 * A flat `<select>` of every active rider, in no useful order. At 1 AM a
 * dispatcher had to hold in their head who was actually working, who was
 * already carrying two jobs, and who was anywhere near the pickup — then find
 * that name in a dropdown. A paid order with nobody free simply sat until
 * somebody noticed it.
 *
 * ## The rule it keeps
 *
 * **It proposes; a person presses.** The top name is a suggestion with its
 * reasons written next to it, not a decision — because the things that make a
 * rider the wrong choice tonight (they are ill, the bike is making a noise,
 * they are already most of the way home) are things a dispatcher knows and the
 * ranking cannot.
 *
 * The dropdown stays underneath, untouched. This is a shortcut past it, never a
 * replacement for it, and a dispatcher who disagrees with the order simply
 * ignores this panel.
 */
export function RiderSuggestions({
  orderId,
  disabled,
  onPick,
  fr,
}: {
  orderId: string;
  /** True while the money gate is unmet — suggesting is fine, assigning is not. */
  disabled: boolean;
  onPick: (riderId: string) => void;
  fr: boolean;
}) {
  const [data, setData] = useState<{
    suggestions: Suggestion[];
    blocked: { fullName: string; reason: string }[];
    pinned: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/orders/${orderId}/rider-suggestions`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => live && setData(d))
      // Named rather than swallowed. A panel that silently shows nothing is
      // indistinguishable from one that has decided there is nobody.
      .catch(() => live && setError(fr ? "Suggestions indisponibles." : "Couldn't load suggestions."));
    return () => {
      live = false;
    };
  }, [orderId, fr]);

  if (error) return <p className="mb-2 text-[11px] text-mist-500">{error}</p>;

  if (!data) {
    return (
      <p className="mb-2 flex items-center gap-2 text-[11px] text-mist-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        {fr ? "Recherche du meilleur livreur…" : "Finding the best rider…"}
      </p>
    );
  }

  if (data.suggestions.length === 0) {
    return (
      <p className="mb-2 rounded-xl border border-caution/30 bg-caution/10 p-2 text-[11px] text-gold-200">
        {fr
          ? "Aucun livreur disponible pour cette course."
          : "No rider can take this one right now."}
        {data.blocked.length > 0 && (
          <span className="mt-1 block text-mist-400">
            {data.blocked.map((b) => `${b.fullName}: ${b.reason}`).join(" · ")}
          </span>
        )}
      </p>
    );
  }

  const [best, ...rest] = data.suggestions;

  return (
    <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-950/20 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
        <Zap className="h-3 w-3" />
        {fr ? "Suggéré" : "Suggested"}
      </p>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-mist-100">{best.fullName}</p>
          <p className="truncate text-[11px] text-mist-400">
            {(fr ? best.reasonsFr : best.reasons).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(best.riderId)}
          className="shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {fr ? "Choisir" : "Pick"}
        </button>
      </div>

      {rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-violet-500/20 pt-2">
          {rest.slice(0, 3).map((s) => (
            <button
              key={s.riderId}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.riderId)}
              className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left text-[11px] text-mist-400 hover:bg-violet-500/10 disabled:opacity-40"
            >
              <span className="truncate">
                {s.fullName}
                <span className="text-mist-600"> · {(fr ? s.reasonsFr : s.reasons)[0]}</span>
              </span>
              {s.km != null && (
                <span className="flex shrink-0 items-center gap-0.5 text-mist-500">
                  <MapPin className="h-2.5 w-2.5" />
                  {s.km.toFixed(1)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Said rather than implied. Without a pickup pin the ranking is on duty
          and load alone, and a dispatcher should know that before trusting it. */}
      {!data.pinned && (
        <p className="mt-2 text-[10px] leading-relaxed text-mist-500">
          {fr
            ? "Pas de point de ramassage — classé sur la disponibilité seule, pas la distance."
            : "No pickup pin — ranked on availability alone, not distance."}
        </p>
      )}
    </div>
  );
}
