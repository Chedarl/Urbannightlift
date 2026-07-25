"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigation, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const RESUME_KEY = "unl_rider_sharing";

/**
 * Rider toggles live-location sharing. Uses the browser's watchPosition and
 * pushes throttled updates (~every 9s) to the order so the customer's map shows
 * the rider moving. Free — no GPS/map SDK cost.
 *
 * Improvements over the first version:
 *  - Auto-resumes sharing when the rider reopens the same order (survives
 *    navigation) via localStorage, instead of silently stopping.
 *  - Surfaces real errors (permission blocked, insecure context, timeout, send
 *    failure) instead of a silent "!".
 *  - Shows a live "last sent / N updates" counter so the rider sees it working.
 */
export function RiderLocationShare({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);

  const clearWatch = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t("rider.order.share.unsupported"));
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(t("rider.order.share.insecure"));
      return;
    }
    setError(null);
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent.current < 9000) return;
        lastSent.current = now;
        try {
          const res = await fetch(`/api/orders/${orderId}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          if (!res.ok) {
            setError(t("rider.order.share.sendFailed"));
            return;
          }
          setError(null);
          setLastSentAt(now);
          setSentCount((n) => n + 1);
        } catch {
          setError(t("rider.order.share.sendFailed"));
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setError(t("rider.order.share.denied"));
        else if (err.code === err.TIMEOUT) setError(t("rider.order.share.timeout"));
        else setError(t("rider.order.share.sendFailed"));
      },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 }
    );
    setSharing(true);
    try { localStorage.setItem(RESUME_KEY, orderId); } catch {}
  }, [orderId, t]);

  const stop = useCallback(() => {
    clearWatch();
    setSharing(false);
    try {
      if (localStorage.getItem(RESUME_KEY) === orderId) localStorage.removeItem(RESUME_KEY);
    } catch {}
  }, [clearWatch, orderId]);

  // Auto-resume if the rider had sharing on for THIS order before navigating away.
  useEffect(() => {
    let shouldResume = false;
    try { shouldResume = localStorage.getItem(RESUME_KEY) === orderId; } catch {}
    if (shouldResume) start();
    // keep the "sent N ago" label ticking
    const tickId = setInterval(() => setTick((n) => n + 1), 5000);
    return () => { clearWatch(); clearInterval(tickId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const agoLabel = (() => {
    if (lastSentAt == null) return "";
    const sec = Math.max(0, Math.round((Date.now() - lastSentAt) / 1000));
    if (sec < 10) return t("track.justNow");
    if (sec < 60) return t("track.secondsShort").replace("{n}", String(sec));
    return t("track.minutesShort").replace("{n}", String(Math.round(sec / 60)));
  })();

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={sharing ? stop : start}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
          sharing ? "bg-safe/15 text-safe ring-1 ring-safe/40" : "bg-violet-600 text-mist-100"
        )}
      >
        {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
        {sharing ? t("rider.order.share.sharing") : t("rider.order.share.start")}
      </button>

      {sharing && !error && (
        <p className="text-center text-[11px] text-mist-500">
          {sentCount > 0
            ? t("rider.order.share.sentAgo").replace("{time}", agoLabel).replace("{n}", String(sentCount))
            : t("rider.order.share.hint")}
        </p>
      )}
      {!sharing && !error && (
        <p className="text-center text-[11px] text-mist-500">{t("rider.order.share.hint")}</p>
      )}
      {error && <p className="rounded-lg bg-restricted/10 px-3 py-2 text-center text-[11px] text-restricted">{error}</p>}
    </div>
  );
}
