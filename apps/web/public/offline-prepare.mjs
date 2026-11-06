import { ensureOfflineGeneration, invalidateOfflineAccess, readOfflineRevocation, saveOfflinePage, sealOfflinePage } from "/offline-vault.mjs";

const STATIC_CACHE = "pos-offline-static-v1";

async function verifyIdentity(identity) {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Identitas kasir belum dapat diverifikasi.");
  }
  let data;
  try { data = await response.json(); } catch {
    await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Data identitas kasir tidak lengkap.");
  }
  if (!data?.user || data.user.id !== identity.cashierId || (data.user.storeId || "store-main") !== identity.storeId) {
    await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Identitas kasir atau toko berubah. Masuk kembali dan coba lagi.");
  }
}

async function verifyPermissions(identity) {
  const response = await fetch("/api/auth/permissions", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Hak akses POS belum dapat diverifikasi.");
  }
  let data;
  try { data = await response.json(); } catch {
    await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Data izin POS tidak lengkap.");
  }
  if (!data?.user || data.user.id !== identity.cashierId || (data.user.storeId || "store-main") !== identity.storeId ||
      !["OWNER", "ADMIN", "CASHIER", "SALES"].includes(data.user.role) ||
      typeof data.authorizationFingerprint !== "string" || !/^[a-f0-9]{16}$/.test(data.authorizationFingerprint) ||
      !data.permissions || typeof data.permissions !== "object") {
    await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Identitas atau izin POS berubah. Masuk kembali dan coba lagi.");
  }
  return data;
}

function workerStatus(worker) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error("Layanan offline belum siap. Muat ulang dan coba lagi.")); }, 5000);
    channel.port1.onmessage = (event) => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
    worker.postMessage({ type: "OFFLINE_CAPABILITY_VERSION" }, [channel.port2]);
  });
}

function preparePosFrame(identity) {
  return new Promise((resolve, reject) => {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Menyiapkan POS offline";
    frame.src = `/pos?__offline_prepare=${token}`;
    const finish = (error, result) => {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      frame.remove();
      if (error) reject(error); else resolve(result);
    };
    const onMessage = (event) => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.token !== token) return;
      if (event.data.type === "POS_OFFLINE_ERROR") return finish(new Error("Modul POS belum siap. Periksa koneksi dan coba lagi."));
      if (event.data.type !== "POS_OFFLINE_READY") return;
      if (event.data.cashierId !== identity.cashierId || event.data.storeId !== identity.storeId || !Array.isArray(event.data.assets) ||
          !["OWNER", "ADMIN", "CASHIER", "SALES"].includes(event.data.role) ||
          typeof event.data.authorizationFingerprint !== "string" || !/^[a-f0-9]{16}$/.test(event.data.authorizationFingerprint) ||
          !event.data.permissions || typeof event.data.permissions !== "object") {
        return finish(new Error("Identitas atau modul POS berubah. Masuk kembali dan coba lagi."));
      }
      finish(null, { assets: event.data.assets, role: event.data.role, authorizationFingerprint: event.data.authorizationFingerprint, permissions: event.data.permissions });
    };
    const timeout = setTimeout(() => finish(new Error("POS belum selesai disiapkan. Periksa koneksi dan coba lagi.")), 30_000);
    window.addEventListener("message", onMessage);
    document.body.appendChild(frame);
  });
}

function staticAssetUrl(value) {
  if (typeof value !== "string") return null;
  const url = new URL(value, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith("/_next/static/")) return null;
  url.hash = "";
  return url.href;
}

/** Prepare an encrypted page only after its identity and every observed static asset are verified. */
export async function prepareOfflineAccess({ cashierId, storeId, pin }) {
  if (!navigator.onLine || !cashierId || !storeId || !/^\d{6,12}$/.test(pin || "")) {
    throw new Error("Hubungkan perangkat dan gunakan PIN 6–12 angka.");
  }
  const worker = navigator.serviceWorker?.controller;
  if (!worker || !globalThis.caches || !globalThis.crypto?.subtle) throw new Error("Layanan offline belum siap. Muat ulang dan coba lagi.");
  const status = await workerStatus(worker);
  if (status?.version !== 2 || !status.ready) throw new Error("Berkas pembuka POS offline belum siap. Muat ulang dan coba lagi.");

  const identity = { cashierId, storeId };
  const revocationAtStart = readOfflineRevocation(cashierId, storeId);
  await verifyIdentity(identity);
  const initialAccess = await verifyPermissions(identity);
  const vaultGeneration = await ensureOfflineGeneration(cashierId, storeId);
  const response = await fetch("/pos", { cache: "no-store" });
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Halaman POS belum dapat disiapkan. Masuk kembali dan coba lagi.");
  }
  const html = await response.text();
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  const marker = documentCopy.querySelector("[data-offline-pos-cashier][data-offline-pos-store]");
  if (marker?.getAttribute("data-offline-pos-cashier") !== cashierId || marker.getAttribute("data-offline-pos-store") !== storeId) {
    throw new Error("Identitas halaman POS tidak sesuai. Masuk kembali dan coba lagi.");
  }
  const authMarker = documentCopy.querySelector("[data-offline-auth-user][data-offline-auth-store][data-offline-auth-role][data-offline-auth-fingerprint][data-offline-auth-verified]");
  const prepared = await preparePosFrame(identity);
  if (authMarker?.getAttribute("data-offline-auth-user") !== cashierId || authMarker.getAttribute("data-offline-auth-store") !== storeId ||
      authMarker.getAttribute("data-offline-auth-verified") !== "true" || authMarker.getAttribute("data-offline-auth-role") !== prepared.role ||
      authMarker.getAttribute("data-offline-auth-fingerprint") !== prepared.authorizationFingerprint ||
      initialAccess.user.role !== prepared.role || initialAccess.authorizationFingerprint !== prepared.authorizationFingerprint ||
      JSON.stringify(initialAccess.permissions) !== JSON.stringify(prepared.permissions)) {
    await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Identitas atau izin halaman POS berubah. Masuk kembali dan coba lagi.");
  }
  const htmlAssets = Array.from(documentCopy.querySelectorAll("script[src], link[href]"), (node) => node.getAttribute("src") || node.getAttribute("href"));
  const assets = [...new Set([...htmlAssets, ...prepared.assets].map(staticAssetUrl).filter(Boolean))];
  if (!assets.some((asset) => new URL(asset).pathname.endsWith(".js"))) throw new Error("Modul POS belum lengkap. Coba siapkan kembali.");

  const cache = await caches.open(STATIC_CACHE);
  for (const asset of assets) {
    const assetResponse = await fetch(asset, { cache: "no-store", headers: { "x-pos-offline-prepare": "1" } });
    const contentType = (assetResponse.headers.get("content-type") || "").split(";", 1)[0].trim();
    const pathname = new URL(asset).pathname;
    const invalidScript = /\.(?:js|mjs)$/i.test(pathname) && !/^(?:text|application)\/(?:x-)?(?:java|ecma)script(?:1\.[0-5])?$/i.test(contentType);
    const invalidStyle = /\.css$/i.test(pathname) && !/^text\/css$/i.test(contentType);
    if (!assetResponse.ok || assetResponse.redirected || /text\/html/i.test(contentType) || invalidScript || invalidStyle) {
      throw new Error("Berkas POS belum lengkap. Periksa koneksi dan coba lagi.");
    }
    await cache.put(asset, assetResponse);
  }
  await verifyIdentity(identity);
  const finalAccess = await verifyPermissions(identity);
  if (finalAccess.user.role !== prepared.role || finalAccess.authorizationFingerprint !== prepared.authorizationFingerprint ||
      JSON.stringify(finalAccess.permissions) !== JSON.stringify(prepared.permissions) ||
      readOfflineRevocation(cashierId, storeId) !== revocationAtStart) {
    await invalidateOfflineAccess(identity.cashierId, identity.storeId).catch(() => undefined);
    throw new Error("Izin POS berubah saat persiapan. Coba siapkan kembali.");
  }
  if (navigator.serviceWorker.controller !== worker) throw new Error("Layanan offline diperbarui. Muat ulang dan coba lagi.");
  const preparedAt = new Date().toISOString();
  const vault = await sealOfflinePage({ ...identity, role: prepared.role, authorizationFingerprint: prepared.authorizationFingerprint, revocationMarker: revocationAtStart, vaultGeneration, html, pin, preparedAt });
  await saveOfflinePage(vault);
  return { preparedAt };
}
