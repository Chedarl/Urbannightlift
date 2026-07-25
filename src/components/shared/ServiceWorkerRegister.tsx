"use client";

import { useEffect } from "react";

/**
 * Registers the service worker. Chrome's install-prompt algorithm still requires
 * a service worker with a fetch handler, so this is what makes the app
 * installable on Android — the manifest alone is not enough.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
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
