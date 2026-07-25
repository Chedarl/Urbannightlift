"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

/**
 * Turns Web Push on for this device.
 *
 * Deliberately explicit rather than auto-prompting: a permission prompt fired
 * on page load is the one people reflexively dismiss, and a dismissed prompt is
 * very hard to recover from. The button explains what it is first.
 *
 * On iOS, push only works once the app has been added to the Home Screen, so
 * that case gets a specific message instead of a failure.
 */

type State = "loading" | "unsupported" | "needs-install" | "disabled" | "off" | "on" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function EnableNotifications({ className = "" }: { className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;

      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // On iOS the API only exists inside an installed app, so "missing" here
        // means "not installed yet" rather than "never going to work".
        setState(isIos && !standalone ? "needs-install" : "unsupported");
        return;
      }

      const res = await fetch("/api/push").then((r) => r.json()).catch(() => null);
      if (!res?.enabled) {
        setState("disabled");
        return;
      }

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const existing = await reg?.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const { publicKey } = await fetch("/api/push").then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = sub.toJSON();
      const ok = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      }).then((r) => r.ok);

      if (ok) setState("on");
      else await sub.unsubscribe().catch(() => {});
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported" || state === "disabled") return null;

  const base =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors";

  if (state === "needs-install") {
    return (
      <span className={`${base} border-ink-600 text-mist-400 ${className}`}>
        <Bell className="h-3.5 w-3.5" /> Add to Home Screen to get alerts
      </span>
    );
  }

  if (state === "denied") {
    return (
      <span className={`${base} border-ink-600 text-mist-400 ${className}`} title="Re-enable notifications in your browser settings for this site">
        <BellOff className="h-3.5 w-3.5" /> Notifications blocked
      </span>
    );
  }

  if (state === "on") {
    return (
      <button type="button" onClick={disable} disabled={busy} className={`${base} border-safe/40 bg-safe/10 text-safe ${className}`}>
        <BellRing className="h-3.5 w-3.5" /> Alerts on
      </button>
    );
  }

  return (
    <button type="button" onClick={enable} disabled={busy} className={`${base} border-gold-400/50 bg-gold-400/10 text-gold-200 hover:bg-gold-400/20 ${className}`}>
      <Bell className="h-3.5 w-3.5" /> {busy ? "Enabling…" : "Turn on alerts"}
    </button>
  );
}
