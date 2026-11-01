const VERSION = 1;
const ITERATIONS = 600000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function validatePin(pin) {
  if (typeof pin !== "string" || !/^\d{6,12}$/.test(pin)) {
    throw new Error("PIN harus terdiri dari 6–12 angka.");
  }
}

function associatedData(vault) {
  return encoder.encode(JSON.stringify([vault.version, vault.cashierId, vault.storeId, vault.preparedAt]));
}

async function deriveKey(pin, salt) {
  validatePin(pin);
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealOfflinePage({ cashierId, storeId, html, pin, preparedAt }) {
  validatePin(pin);
  if (!cashierId || !storeId || typeof html !== "string" || !html || html.length > 10_000_000 || !Number.isFinite(Date.parse(preparedAt))) {
    throw new Error("Data POS belum lengkap untuk disiapkan secara offline.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const vault = { id: JSON.stringify([cashierId, storeId]), version: VERSION, cashierId, storeId, preparedAt, salt, iv };
  const key = await deriveKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: associatedData(vault) }, key, encoder.encode(html));
  return { ...vault, ciphertext };
}

export async function openOfflinePage(vault, pin, now = new Date()) {
  if (!vault || vault.version !== VERSION || !vault.cashierId || !vault.storeId ||
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
    const request = indexedDB.open("pos-offline-access", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pages", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Penyimpanan offline sedang dipakai tab lain."));
  });
}

export async function saveOfflinePage(vault) {
  const db = await openVaultDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("pages", "readwrite");
      tx.objectStore("pages").put(vault);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Penyimpanan offline dibatalkan."));
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
