/*
 * Urban Night Lift service worker.
 *
 * Its main job is installability: Chrome's install-prompt algorithm still
 * requires a service worker with a fetch handler, so without this the
 * "Install app" button never appears on Android even though the manifest is
 * valid.
 *
 * It is deliberately conservative — a delivery app must never show stale prices,
 * order status or tracking. Navigations and API calls always go to the network;
 * we only fall back to a cached shell when the device is genuinely offline, and
 * only static build assets are cached.
 */

const VERSION = "unl-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET, cross-origin, or API traffic.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: always network-first so order status is never stale.
  // Fall back to the offline page only when the network fails outright.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Immutable build output: safe to serve from cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else: straight to the network, with a cache fallback offline.
  event.respondWith(fetch(request).catch(() => caches.match(request).then((c) => c || Response.error())));
});
