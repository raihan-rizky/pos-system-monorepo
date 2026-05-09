/**
 * POS System Service Worker
 * Strategy:
 *   - Static/font/image assets  → Cache First (serve from cache, update in background)
 *   - Next.js page chunks (_next/static) → Cache First
 *   - API routes (/api/*)        → Network First with 5s timeout, fallback to cache
 *   - HTML navigation            → Network First, fallback to cached shell
 */

const CACHE_NAME = "pos-v2";
const OFFLINE_URL = "/pos"; // fallback page when fully offline

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  "/",
  "/pos",
  "/dashboard",
  "/history",
  "/production",
  "/customers",
  "/products",
  "/salespersons",
  "/shift",
  "/settings",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: "reload" }))
        )
      )
    )
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "POS System",
    body: "Ada notifikasi baru.",
    url: "/dashboard",
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => client.url.includes(location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
        return;
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API routes → Network First (fresh data preferred, cache as fallback)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithTimeout(request, 5000));
    return;
  }

  // Next.js static chunks → Cache First (immutable hashed filenames)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML navigation → Network First, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      navigationNetworkFirst(request)
    );
    return;
  }

  // Everything else → Stale While Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const network = await fetch(request);
  if (network.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, network.clone());
  }
  return network;
}

async function networkFirstWithTimeout(request, timeoutMs) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const network = await fetch(request, { signal: controller.signal });
    clearTimeout(id);
    if (network.ok) cache.put(request, network.clone());
    return network;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.json({ message: "Offline — data tidak tersedia" }, { status: 503 });
  }
}

async function navigationNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const network = await fetch(request);
    if (network.ok) {
      await cache.put(request, network.clone());
      await cache.put(new URL(request.url).pathname, network.clone());
    }
    return network;
  } catch {
    const url = new URL(request.url);
    const cached =
      (await cache.match(request)) ||
      (await cache.match(url.pathname)) ||
      (await cache.match(OFFLINE_URL));

    if (cached) return cached;

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((network) => {
    if (network.ok) cache.put(request, network.clone());
    return network;
  });
  return cached || networkPromise;
}
