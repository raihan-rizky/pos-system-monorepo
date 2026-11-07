const VERSION = 2;
const ITERATIONS = 600000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
export const OFFLINE_REVOCATION_CHANNEL = "pos:offline-access-revoked";

export function offlineRevocationKey(cashierId, storeId) {
  if (!cashierId || !storeId) throw new Error("Identitas kasir atau toko belum tersedia.");
  return `pos:offline-access-revoked:${JSON.stringify([cashierId, storeId])}`;
}

/** A persistent marker prevents a previously denied account reopening an old vault. */
export function readOfflineRevocation(cashierId, storeId) {
  return localStorage.getItem(offlineRevocationKey(cashierId, storeId));
}

export function revokeOfflineAccess(cashierId, storeId) {
  const value = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(offlineRevocationKey(cashierId, storeId), value);
  return value;
}

/** Revoke the marker and remove the old vault even if marker storage is full. */
export function invalidateOfflineAccess(cashierId, storeId) {
  try { revokeOfflineAccess(cashierId, storeId); } catch { /* IndexedDB is also used for revocation. */ }
  const notify = () => {
    try {
      const channel = new BroadcastChannel(OFFLINE_REVOCATION_CHANNEL);
      channel.postMessage({ cashierId, storeId });
      channel.close();
    } catch { /* Storage events cover other tabs when broadcasting is unavailable. */ }
  };
  notify();
  return revokeStoredOfflineAccess(cashierId, storeId).then(notify);
}

/** A new verified vault binds the marker; an older vault cannot clear a newer revocation. */
export function offlineRevocationMatches(cashierId, storeId, expected) {
  return (expected === null || typeof expected === "string") && readOfflineRevocation(cashierId, storeId) === expected;
}

function validatePin(pin) {
  if (typeof pin !== "string" || !/^\d{6,12}$/.test(pin)) {
    throw new Error("PIN harus terdiri dari 6–12 angka.");
  }
}

function associatedData(vault) {
  return encoder.encode(JSON.stringify([
    vault.version, vault.cashierId, vault.storeId, vault.role, vault.authorizationFingerprint, vault.revocationMarker, vault.vaultGeneration, vault.preparedAt,
  ]));
}

async function deriveKey(pin, salt) {
  validatePin(pin);
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealOfflinePage({ cashierId, storeId, role, authorizationFingerprint, revocationMarker, vaultGeneration, html, pin, preparedAt }) {
  validatePin(pin);
  if (!cashierId || !storeId || !["OWNER", "ADMIN", "CASHIER", "SALES"].includes(role) ||
      typeof authorizationFingerprint !== "string" || !/^[a-f0-9]{16}$/.test(authorizationFingerprint) ||
      !(revocationMarker === null || typeof revocationMarker === "string" && /^[a-f0-9]{32}$/.test(revocationMarker)) ||
      typeof vaultGeneration !== "string" || !/^[a-f0-9]{32}$/.test(vaultGeneration) ||
      typeof html !== "string" || !html || html.length > 10_000_000 || !Number.isFinite(Date.parse(preparedAt))) {
    throw new Error("Data POS belum lengkap untuk disiapkan secara offline.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const vault = { id: JSON.stringify([cashierId, storeId]), version: VERSION, cashierId, storeId, role, authorizationFingerprint, revocationMarker, vaultGeneration, preparedAt, salt, iv };
  const key = await deriveKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: associatedData(vault) }, key, encoder.encode(html));
  return { ...vault, ciphertext };
}

export async function openOfflinePage(vault, pin, now = new Date()) {
  if (!vault || vault.version !== VERSION || !vault.cashierId || !vault.storeId ||
      !["OWNER", "ADMIN", "CASHIER", "SALES"].includes(vault.role) ||
      typeof vault.authorizationFingerprint !== "string" || !/^[a-f0-9]{16}$/.test(vault.authorizationFingerprint) ||
      !(vault.revocationMarker === null || typeof vault.revocationMarker === "string" && /^[a-f0-9]{32}$/.test(vault.revocationMarker)) ||
      typeof vault.vaultGeneration !== "string" || !/^[a-f0-9]{32}$/.test(vault.vaultGeneration) ||
      vault.id !== JSON.stringify([vault.cashierId, vault.storeId])) throw new Error("Data POS offline tidak valid.");
  const age = now.getTime() - Date.parse(vault.preparedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > MAX_AGE_MS) {
    throw new Error("Persiapan POS sudah kedaluwarsa. Hubungkan perangkat dan siapkan kembali.");
  }
  const key = await deriveKey(pin, vault.salt);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: vault.iv, additionalData: associatedData(vault) }, key, vault.ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("PIN salah atau data POS offline tidak dapat dibuka.");
  }
}

function openVaultDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pos-offline-access", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("pages")) request.result.createObjectStore("pages", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("generations")) request.result.createObjectStore("generations", { keyPath: "id" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Penyimpanan offline sedang dipakai tab lain."));
  });
}

/** A preparation captures a generation that revocation can invalidate atomically. */
export async function ensureOfflineGeneration(cashierId, storeId) {
  const id = JSON.stringify([cashierId, storeId]);
  const db = await openVaultDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("generations", "readwrite");
      const store = tx.objectStore("generations");
      const request = store.get(id);
      let value;
      request.onsuccess = () => {
        value = request.result?.value;
        if (!value) {
          value = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
          store.put({ id, value });
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Persiapan akses offline dibatalkan."));
    });
  } finally { db.close(); }
}

async function revokeStoredOfflineAccess(cashierId, storeId) {
  const id = JSON.stringify([cashierId, storeId]);
  const db = await openVaultDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["pages", "generations"], "readwrite");
      tx.objectStore("pages").delete(id);
      tx.objectStore("generations").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Pencabutan akses offline dibatalkan."));
    });
  } finally { db.close(); }
}

/** Remove the invalidated page without touching transactions or a newer verified page. */
export async function removeRevokedOfflinePage(cashierId, storeId, marker) {
  const db = await openVaultDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("pages", "readwrite");
      const store = tx.objectStore("pages");
      const key = JSON.stringify([cashierId, storeId]);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result && (marker === undefined || request.result.revocationMarker !== marker)) store.delete(key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Pencabutan akses offline dibatalkan."));
    });
  } finally { db.close(); }
}

export async function saveOfflinePage(vault) {
  const db = await openVaultDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["pages", "generations"], "readwrite");
      const request = tx.objectStore("generations").get(vault.id);
      let revoked = false;
      request.onsuccess = () => {
        if (!vault.vaultGeneration || request.result?.value !== vault.vaultGeneration) {
          revoked = true;
          tx.abort();
        } else {
          tx.objectStore("pages").put(vault);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(revoked ? new Error("Akses POS berubah saat persiapan. Siapkan kembali.") : tx.error || new Error("Penyimpanan offline dibatalkan."));
    });
  } finally { db.close(); }
}

/** Do not unlock a page that was deleted, replaced, or revoked in another tab. */
export async function isCurrentOfflinePage(page) {
  const db = await openVaultDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["pages", "generations"], "readonly");
      const saved = tx.objectStore("pages").get(page.id);
      const generation = tx.objectStore("generations").get(page.id);
      tx.oncomplete = () => {
        const current = saved.result;
        const oldIv = Array.from(page.iv || []);
        const currentIv = Array.from(current?.iv || []);
        resolve(Boolean(current && oldIv.length === 12 && currentIv.length === 12 &&
          oldIv.every((byte, index) => byte === currentIv[index]) &&
          current.vaultGeneration === page.vaultGeneration && generation.result?.value === page.vaultGeneration));
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Pemeriksaan akses offline dibatalkan."));
    });
  } finally { db.close(); }
}

/** Recheck the stored authorization before a PIN handoff grants offline actions. */
export async function isCurrentOfflineAuthorization(snapshot) {
  const id = JSON.stringify([snapshot.cashierId, snapshot.storeId]);
  const db = await openVaultDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["pages", "generations"], "readonly");
      const saved = tx.objectStore("pages").get(id);
      const generation = tx.objectStore("generations").get(id);
      tx.oncomplete = () => {
        const current = saved.result;
        resolve(Boolean(current && current.cashierId === snapshot.cashierId && current.storeId === snapshot.storeId &&
          current.role === snapshot.role && current.authorizationFingerprint === snapshot.authorizationFingerprint &&
          current.revocationMarker === snapshot.revocationMarker && current.preparedAt === snapshot.preparedAt &&
          current.vaultGeneration === snapshot.vaultGeneration && generation.result?.value === snapshot.vaultGeneration));
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Pemeriksaan akses offline dibatalkan."));
    });
  } finally { db.close(); }
}

export async function listOfflinePages() {
  const db = await openVaultDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("pages", "readonly").objectStore("pages").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
