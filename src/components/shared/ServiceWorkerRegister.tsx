"use client";

import { useEffect } from "react";

/**
 * Registers the service worker — and, on iOS Safari, gets rid of it.
 *
 * The worker exists for exactly one reason: Chrome's install-prompt algorithm
 * still requires a service worker with a fetch handler, so without it the
 * "Install app" button never appears on Android.
 *
 * On iOS it earns nothing and can cost everything. Safari installs to the Home
 * Screen through Share → Add to Home Screen with no worker involved, while a
 * worker sitting in front of every navigation is a standing risk: Safari
 * refuses a redirected response served by a worker, and a device that has
 * cached a bad build keeps serving it with no way for the visitor to clear it.
 * A phone in that state simply does not open the site.
 *
 * So in plain iOS Safari we unregister any worker and drop its caches, which
 * also repairs phones already stuck on one. The exception is an iOS app already
 * added to the Home Screen: there the worker is what makes Web Push possible
 * (iOS 16.4+ supports push only for installed apps), and losing it would take
 * notifications with it.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // iOS lies about being a Mac on iPads, so touch support is part of the test.
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isInstalled =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // Safari's own flag for a Home Screen app.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isIOS && !isInstalled) {
      void (async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {
          // Never let cleanup break the page — the visitor is here to order.
        }
      })();
      return;
    }

    // Registration failures must never break the page.
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
