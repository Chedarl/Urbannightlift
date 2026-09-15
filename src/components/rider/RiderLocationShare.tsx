"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigation, Loader2, Sun, AlertTriangle, CloudOff } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { ScreenWakeLock, wakeLockSupported } from "@/lib/tracking/wakeLock";
import { flushOutbox, queueFix, queuedCount, type QueuedFix } from "@/lib/tracking/outbox";
import { freshness } from "@/lib/orders/eta";
import { cn } from "@/lib/utils";

/**
 * The rider's live position, made to survive an actual delivery.
 *
 * The first version was a toggle over `watchPosition`, and riders reported that
 * tracking "constantly fails". It did, for six reasons, none of them visible in
 * the code itself:
 *
 *  1. The screen slept, the tab was backgrounded, and the browser stopped
 *     delivering positions. This was the main one — a platform limit, not a bug.
 *  2. The rider had to remember to press a button on every single order.
 *  3. One GPS timeout killed the watch for the rest of the trip; nothing retried.
 *  4. `enableHighAccuracy` with a short timeout turned a weak fix into an error
 *     rather than a coarse position.
 *  5. A failed send was discarded, so a dead-signal patch lost the trail.
 *  6. Riders had no way to tell whether any of it was working.
 *
 * So: a screen wake lock for the length of the delivery, sharing that starts
 * itself once the job is accepted, a watch that restarts on failure and falls
 * back to coarse positioning, an outbox for fixes that could not be sent, and a
 * plain readout of what is actually happening.
 *
 * What this still cannot do is read GPS with the screen off. Nothing on the web
 * can; that needs a native app or a tracker on the bike.
 */

const RESUME_KEY = "unl_rider_sharing";
/** One fix roughly every 9s — a smooth line without draining the battery. */
const SEND_INTERVAL_MS = 9_000;
/** Stop insisting on precision after this many failures and take what we can get. */
const COARSE_AFTER_ERRORS = 3;
const RESTART_DELAY_MS = 4_000;

export function RiderLocationShare({
  orderId,
  /** True once the rider has taken the job — sharing then starts on its own. */
  autoStart = false,
  /** True when the delivery is over, so the lock and the watch are dropped. */
  finished = false,
}: {
  orderId: string;
  autoStart?: boolean;
  finished?: boolean;
}) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const [screenHeld, setScreenHeld] = useState(false);
  const [, setTick] = useState(0);

  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const errorStreak = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<ScreenWakeLock | null>(null);
  if (wakeLock.current === null && typeof window !== "undefined") {
    wakeLock.current = new ScreenWakeLock();
  }

  const postFix = useCallback(
    async (fix: QueuedFix): Promise<boolean> => {
      try {
        const res = await fetch(`/api/orders/${orderId}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: fix.lat, lng: fix.lng }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [orderId]
  );

  const clearWatch = useCallback(() => {
    if (watchId.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  }, []);

  /** Begin (or restart) the watch. `coarse` drops the accuracy demand. */
  const beginWatch = useCallback(
    (coarse: boolean) => {
      clearWatch();
      watchId.current = navigator.geolocation.watchPosition(
        async (pos) => {
          errorStreak.current = 0;
          setError(null);
          const now = Date.now();
          if (now - lastSent.current < SEND_INTERVAL_MS) return;
          lastSent.current = now;

          const fix: QueuedFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: now };
          if (await postFix(fix)) {
            setLastSentAt(now);
            setSentCount((n) => n + 1);
            // Back on the network: send whatever piled up while we were off it.
            const flushed = await flushOutbox(postFix);
            if (flushed > 0) setSentCount((n) => n + flushed);
          } else {
            // Hold it rather than lose it; the map will catch up.
            queueFix(fix);
          }
          setQueued(queuedCount());
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            // Nothing to retry — only the rider can change this.
            setError(t("rider.order.share.denied"));
            setFatal(true);
            clearWatch();
            return;
          }
          errorStreak.current += 1;
          setError(
            err.code === err.TIMEOUT
              ? t("rider.order.share.timeout")
              : t("rider.order.share.sendFailed")
          );
          // A timeout between buildings is normal. Restart, and stop demanding
          // high accuracy once it is clearly not available here.
          restartTimer.current = setTimeout(
            () => beginWatch(coarse || errorStreak.current >= COARSE_AFTER_ERRORS),
            RESTART_DELAY_MS
          );
        },
        coarse
          ? { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 }
          : { enableHighAccuracy: true, maximumAge: 10_000, timeout: 45_000 }
      );
    },
    [clearWatch, postFix, t]
  );

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t("rider.order.share.unsupported"));
      setFatal(true);
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(t("rider.order.share.insecure"));
      setFatal(true);
      return;
    }
    setError(null);
    setFatal(false);
    errorStreak.current = 0;
    beginWatch(false);
    setSharing(true);
    try {
      localStorage.setItem(RESUME_KEY, orderId);
    } catch {
      // Private mode: sharing still works, it just will not auto-resume.
    }
    // The single most important line here. Without it the screen sleeps and the
    // browser stops handing us positions.
    setScreenHeld((await wakeLock.current?.acquire()) ?? false);
  }, [beginWatch, orderId, t]);

  const stop = useCallback(() => {
    clearWatch();
    setSharing(false);
    setScreenHeld(false);
    void wakeLock.current?.release();
    try {
      if (localStorage.getItem(RESUME_KEY) === orderId) localStorage.removeItem(RESUME_KEY);
    } catch {
      // Nothing to clean up.
    }
  }, [clearWatch, orderId]);

  // Start by itself when the rider has the job, or resume if they were already
  // sharing and simply navigated away. Riders should not have to remember this.
  useEffect(() => {
    if (finished) {
      stop();
      return;
    }
    let resume = false;
    try {
      resume = localStorage.getItem(RESUME_KEY) === orderId;
    } catch {
      resume = false;
    }
    if (resume || autoStart) void start();

    const tickId = setInterval(() => {
      setTick((n) => n + 1);
      setScreenHeld(wakeLock.current?.held ?? false);
    }, 5_000);
    return () => {
      clearWatch();
      clearInterval(tickId);
      void wakeLock.current?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, autoStart, finished]);

  /**
   * How long since the last fix went up.
   *
   * This line used to read "last sent just now ago · 12 updates" — and on this
   * screen that was not a rare state, it was the normal one: a rider who is
   * sharing correctly sends every few seconds, so the rider doing the right
   * thing was the one shown broken copy. The frame takes a duration; "just now"
   * is a sentence. They are now different shapes so they cannot be swapped.
   */
  const fresh = freshness(lastSentAt == null ? null : Date.now() - lastSentAt);
  const agoLabel =
    fresh.kind === "seconds"
      ? t("track.secondsShort").replace("{n}", String(fresh.n))
      : fresh.kind === "minutes"
        ? t("track.minutesShort").replace("{n}", String(fresh.n))
        : "";

  if (finished) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={sharing ? stop : () => void start()}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
          sharing ? "bg-safe/15 text-safe ring-1 ring-safe/40" : "bg-violet-600 text-mist-100"
        )}
      >
        {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
        {sharing ? t("rider.order.share.sharing") : t("rider.order.share.start")}
      </button>

      {sharing && (
        <>
          {!error && (
            <p className="text-center text-xs text-mist-500">
              {sentCount === 0
                ? t("rider.order.share.hint")
                : fresh.kind === "now" || !agoLabel
                  ? t("rider.order.share.sentJustNow").replace("{n}", String(sentCount))
                  : t("rider.order.share.sentAgo")
                      .replace("{time}", agoLabel)
                      .replace("{n}", String(sentCount))}
            </p>
          )}
          {screenHeld && (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-mist-500">
              <Sun className="h-3 w-3 text-gold-300" />
              {t("rider.order.share.screenOn")}
            </p>
          )}
          {!screenHeld && wakeLockSupported() && (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gold-300">
              <AlertTriangle className="h-3 w-3" />
              {t("rider.order.share.keepScreenOn")}
            </p>
          )}
          {queued > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gold-300">
              <CloudOff className="h-3 w-3" />
              {t("rider.order.share.queued").replace("{n}", String(queued))}
            </p>
          )}
        </>
      )}

      {!sharing && !error && (
        <p className="text-center text-xs text-mist-500">{t("rider.order.share.hint")}</p>
      )}

      {error && (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-center text-xs",
            fatal ? "bg-restricted/10 text-restricted" : "bg-caution/10 text-caution"
          )}
        >
          {error}
          {!fatal && ` ${t("rider.order.share.retrying")}`}
        </p>
      )}
    </div>
  );
}
