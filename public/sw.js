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

// Bumping this drops every previously cached asset on activate. It is the
// lever that gets a device off a bad cached build, so it must change whenever
// the worker's behaviour does.
const VERSION = "unl-v3";
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
  //
  // Safari REFUSES a redirected response served by a service worker for a
  // navigation — it fails the load outright with "a redirected response was
  // used for a request whose redirect mode is not follow", and the visitor gets
  // a blank error page rather than the site. This app redirects on plenty of
  // navigations (/account, /admin and /rider all bounce to a login), so the
  // redirect flag has to be stripped by rebuilding the response before it is
  // handed back. Chrome tolerates the original; Safari does not.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!response.redirected) return response;
          const body = await response.blob();
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        })
        .catch(() => caches.match(OFFLINE_URL).then((cached) => cached || Response.error()))
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

/*
 * Push notifications.
 *
 * This is how a new order, an arriving payment or a delivery assignment reaches
 * someone when the app is closed — the gap that let orders sit unnoticed. Free
 * on Android and desktop; on iOS it works only once the app has been added to
 * the Home Screen, which the install prompt guides people through.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Urban Night Lift", body: event.data.text(), url: "/" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Urban Night Lift", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Repeat alerts about the same order replace each other rather than
      // stacking into a wall of notifications.
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/" },
      vibrate: [80, 40, 80],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  // Reuse an open tab if the app is already running, so tapping a notification
  // never leaves a dispatcher with five copies of the console open.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      for (const client of clients) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(target).then((c) => c && c.focus());
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
