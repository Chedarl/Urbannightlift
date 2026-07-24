"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Rider toggles live-location sharing. Uses the browser's watchPosition and
 * pushes throttled updates (~every 15s) to the order so the customer's map
 * shows the rider moving. Free — no GPS/map SDK cost.
 */
export function RiderLocationShare({ orderId }: { orderId: string }) {
  const { locale } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);

  const stop = () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  };

  useEffect(() => () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); }, []);

  function start() {
    if (!navigator.geolocation) { setError(true); return; }
    setError(false);
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent.current < 15000) return;
        lastSent.current = now;
        await fetch(`/api/orders/${orderId}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => setError(true),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    setSharing(true);
  }

  return (
    <button
      type="button"
      onClick={sharing ? stop : start}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
        sharing ? "bg-safe/15 text-safe ring-1 ring-safe/40" : "bg-violet-600 text-mist-100"
      )}
    >
      {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
      {sharing
        ? locale === "fr" ? "Partage de position actif — appuyez pour arrêter" : "Sharing live location — tap to stop"
        : locale === "fr" ? "Partager ma position en direct" : "Share my live location"}
      {error && <span className="text-restricted">!</span>}
    </button>
  );
}
