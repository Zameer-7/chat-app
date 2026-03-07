/* Vibely Service Worker — v1 */

const CACHE_NAME = "vibely-v1";
const PRECACHE_URLS = ["/", "/index.html"];

// ─── Install: precache app shell ───────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for old SW to die
  self.skipWaiting();
});

// ─── Activate: remove stale caches ─────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

// ─── Fetch: network-first, fall back to cache ──────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never cache API calls or WebSocket upgrade requests
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone into cache only for same-origin, successful responses
        if (response.ok && response.type === "basic") {
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── Push: show notification ────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "Vibely", body: event.data?.text() ?? "You have a new notification" };
  }

  const title = data.title || "Vibely";
  const options = {
    body: data.body || "You have a new notification",
    icon: "/vibely-icon.svg",
    badge: "/vibely-icon.svg",
    tag: data.tag || "vibely-default",
    renotify: true,
    vibrate: [100, 50, 100],
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click: focus or open window ──────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("navigate" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});
