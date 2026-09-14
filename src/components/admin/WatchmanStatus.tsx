"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Clock } from "lucide-react";

interface Status {
  ranAt: string | null;
  minutesAgo: number | null;
  stale: boolean;
}

/**
 * Whether anything is actually watching tonight.
 *
 * The fifth readout on this screen, for the reason all four before it exist:
 * something fails invisibly in this product roughly once a round, and the fix
 * is always to put it somewhere a person looks. Maps drew CARTO while the panel
 * said Google. Mail failed for a fortnight with the reason unread in a table.
 * The AI key was rotated twice against a variable the app never read. Signing
 * secrets could fall through to a literal in the repository.
 *
 * This one is the sharpest version yet, because it failed *loudly in the wrong
 * place*. The watchman is called by a GitHub Actions workflow that needs
 * `CRON_SECRET` in GitHub's secret store — separate from Vercel's, which has
 * it. Nobody added it, so the job failed **374 times over a month**, every
 * failure landing in an inbox and none of them on any screen here. From inside
 * the product everything looked perfect; from outside it looked like a system
 * failing constantly.
 *
 * A timestamp fixes that, and the sentence underneath says what to do.
 */
export function WatchmanStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/watchman", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          setDenied(true);
          return;
        }
        setStatus(await r.json());
      })
      .catch(() => setStatus(null));
  }, []);

  if (denied || !status) return null;

  const never = status.ranAt == null;
  const ok = !status.stale;

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-mist-100">
        {ok ? (
          <Eye className="h-4 w-4 text-safe" />
        ) : (
          <EyeOff className="h-4 w-4 text-caution" />
        )}
        Watchman
      </p>

      <p className="mt-1.5 flex items-center gap-1.5 text-sm">
        <Clock className="h-3.5 w-3.5 text-mist-500" />
        {never ? (
          <span className="text-caution">It has never run.</span>
        ) : (
          <span className={ok ? "text-mist-300" : "text-caution"}>
            Last looked at the night{" "}
            {status.minutesAgo === 0
              ? "just now"
              : `${status.minutesAgo} minute${status.minutesAgo === 1 ? "" : "s"} ago`}
            .
          </span>
        )}
      </p>

      {/*
        The instruction, in the product rather than in a workflow log. Somebody
        reading this screen is the person who can fix it, and the fix is two
        minutes — but only if they are told the two stores are separate, which
        is the part that is not obvious and cost a month.
      */}
      {!ok && (
        <p className="mt-2 rounded-xl bg-caution/10 px-3 py-2 text-xs leading-relaxed text-caution">
          {never
            ? "Nothing is checking for stalled orders between rounds. The watchman is called by a GitHub Actions workflow that needs CRON_SECRET added under Settings → Secrets and variables → Actions, with the same value as CRON_SECRET in Vercel. They are two separate stores, and only Vercel has it."
            : "The watchman has been quiet for longer than expected. Check the Watchman workflow under the repository's Actions tab — its run summary says what stopped it."}
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-mist-500">
        Every half hour through the night it looks at every live order and raises
        the ones that have stalled — unpriced, unpaid, unassigned, or out with a
        rider whose phone has stopped reporting. It never changes an order; it
        tells a person.
      </p>
    </section>
  );
}
