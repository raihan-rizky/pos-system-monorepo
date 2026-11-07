/**
 * POS System Service Worker
 *
 * Cache only explicitly public assets. Authenticated API, navigation, and
 * React Server Component responses must never enter the shared cache.
 */

const CACHE_PREFIX = "pos-v";
const CACHE_NAME = "pos-v11";
const OFFLINE_STATIC_CACHE = "pos-offline-static-v1";

const REQUIRED_OFFLINE_ASSETS = [
  "/offline.html",
  "/offline-unlock.mjs",
  "/offline-vault.mjs",
];
const OPTIONAL_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(REQUIRED_OFFLINE_ASSETS.map(async (asset) => {
      const request = new Request(asset, { cache: "reload" });
      const response = await fetch(request);
      const contentType = response.headers.get("content-type") || "";
      const expectedType = asset.endsWith(".html") ? /text\/html/i : /javascript|ecmascript/i;
      if (!response.ok || response.redirected || !expectedType.test(contentType)) throw new Error(`Invalid offline asset: ${asset}`);
      await cache.put(request, response);
    }));
    await Promise.allSettled(OPTIONAL_ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "OFFLINE_CAPABILITY_VERSION") {
    event.waitUntil((async () => {
      let ready = false;
      try {
        const cache = await caches.open(CACHE_NAME);
        const [page, unlock, vault] = await Promise.all([
          cache.match("/offline.html"), cache.match("/offline-unlock.mjs"), cache.match("/offline-vault.mjs"),
        ]);
        ready = Boolean(page?.ok && !page.redirected && page.headers.get("content-type")?.includes("text/html") &&
          unlock?.ok && !unlock.redirected && /javascript|ecmascript/i.test(unlock.headers.get("content-type") || "") &&
          vault?.ok && !vault.redirected && /javascript|ecmascript/i.test(vault.headers.get("content-type") || ""));
      } catch { /* Preparation must fail closed if the fallback is unavailable. */ }
      event.ports?.[0]?.postMessage({ version: 2, ready });
    })());
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

  console.info("[sw][push] Notification received", {
    title: payload.title,
    tag: payload.tag,
    url: payload.url,
  });

  event.waitUntil(
    Promise.all([
      notifyOpenClients(payload),
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.tag,
        renotify: Boolean(payload.tag),
        data: { url: payload.url || "/dashboard" },
      }),
    ]),
  );
});

async function notifyOpenClients(payload) {
  const clientList = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientList) {
    client.postMessage({
      type: "POS_PUSH_NOTIFICATION",
      payload,
    });
  }
}

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
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== location.origin) return;
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkWithPreparedStatic(request));
    return;
  }
  if (url.pathname.startsWith("/_next/")) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnlyApi(request));
    return;
  }

  if (
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/offline-vault.mjs" ||
    url.pathname === "/offline-unlock.mjs"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkOnlyNavigation(request));
    return;
  }

  // Other GET requests can contain user-specific server-rendered data. Let the
  // browser fetch them normally rather than placing them in a shared cache.
});

async function networkOnlyNavigation(request) {
  try {
    const response = await fetch(request);
    if (new URL(request.url).pathname !== "/pos" || ![502, 503, 504].includes(response.status)) return response;
  } catch { /* Use the offline page when the network is unavailable. */ }
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match("/offline.html")) || new Response("Koneksi terputus. Hubungkan perangkat dan coba lagi.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function networkWithPreparedStatic(request) {
  if (request.headers.get("x-pos-offline-prepare") === "1") return fetch(request);
  try {
    const response = await fetch(request);
    if (response.ok) return response;
    const cached = await (await caches.open(OFFLINE_STATIC_CACHE)).match(request);
    return cached || response;
  } catch {
    const cached = await (await caches.open(OFFLINE_STATIC_CACHE)).match(request);
    return cached || new Response("", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const network = await fetch(request);
    if (network.ok) {
      cache.put(request, network.clone());
    }
    return network;
  } catch {
    return new Response("", { status: 503 });
  }
}

async function networkOnlyApi(request) {
  try {
    return await fetch(request);
  } catch {
    return Response.json(
      { message: "Offline - data tidak tersedia" },
      { status: 503 },
    );
  }
}
