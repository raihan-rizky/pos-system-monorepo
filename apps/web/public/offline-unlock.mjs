import { isCurrentOfflinePage, listOfflinePages, OFFLINE_REVOCATION_CHANNEL, offlineRevocationMatches, openOfflinePage } from "/offline-vault.mjs";

const status = document.getElementById("offline-status");
const form = document.getElementById("offline-unlock");
const select = document.getElementById("offline-account");
const pin = document.getElementById("offline-pin");
const error = document.getElementById("offline-error");
const button = form.querySelector("button");
let pages = [];
const revoked = new Set();
const listeners = new Set();
let guard;
try {
  const channel = new BroadcastChannel(OFFLINE_REVOCATION_CHANNEL);
  channel.onmessage = (event) => {
    const { cashierId, storeId } = event.data || {};
    if (typeof cashierId !== "string" || typeof storeId !== "string") return;
    revoked.add(JSON.stringify([cashierId, storeId]));
    for (const listener of listeners) listener(cashierId, storeId);
  };
  guard = Object.freeze({
    has: (cashierId, storeId) => revoked.has(JSON.stringify([cashierId, storeId])),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => channel.close(),
  });
} catch { /* Do not grant an offline session without cross-tab revocation. */ }

async function initialize() {
  try {
    pages = await listOfflinePages();
    if (!pages.length) { status.textContent = "Belum ada akun POS yang disiapkan di perangkat ini."; return; }
    for (const page of pages) {
      const option = document.createElement("option");
      option.value = page.id;
      option.textContent = `Kasir ${page.cashierId} · Toko ${page.storeId}`;
      select.appendChild(option);
    }
    status.textContent = "Pilih akun dan masukkan PIN offline.";
    form.hidden = false;
  } catch {
    status.textContent = "Data perangkat belum dapat dibaca. Hubungkan kembali dan coba lagi.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  button.disabled = true;
  try {
    const page = pages.find((candidate) => candidate.id === select.value);
    if (!page) throw new Error("Akun offline tidak ditemukan.");
    if (!guard) throw new Error("Perlindungan akses offline belum tersedia. Hubungkan perangkat dan coba lagi.");
    if (revoked.has(page.id) || !offlineRevocationMatches(page.cashierId, page.storeId, page.revocationMarker)) {
      throw new Error("Akses offline dicabut. Hubungkan perangkat dan siapkan kembali.");
    }
    const html = await openOfflinePage(page, pin.value);
    pin.value = "";
    if (!navigator.serviceWorker?.controller) throw new Error("POS offline belum siap. Hubungkan kembali dan siapkan perangkat.");
    const copy = new DOMParser().parseFromString(html, "text/html");
    const marker = copy.querySelector("[data-offline-auth-user][data-offline-auth-store][data-offline-auth-role][data-offline-auth-fingerprint][data-offline-auth-verified]");
    if (marker?.getAttribute("data-offline-auth-user") !== page.cashierId ||
        marker.getAttribute("data-offline-auth-store") !== page.storeId ||
        marker.getAttribute("data-offline-auth-role") !== page.role ||
        marker.getAttribute("data-offline-auth-fingerprint") !== page.authorizationFingerprint ||
        marker.getAttribute("data-offline-auth-verified") !== "true") {
      throw new Error("Identitas atau izin POS offline tidak sesuai. Siapkan kembali saat online.");
    }
    if (revoked.has(page.id) || !offlineRevocationMatches(page.cashierId, page.storeId, page.revocationMarker) ||
        !await isCurrentOfflinePage(page) || revoked.has(page.id)) {
      throw new Error("Akses offline dicabut. Hubungkan perangkat dan siapkan kembali.");
    }
    const authorization = Object.freeze({
      cashierId: page.cashierId, storeId: page.storeId, role: page.role,
      authorizationFingerprint: page.authorizationFingerprint, revocationMarker: page.revocationMarker, vaultGeneration: page.vaultGeneration, preparedAt: page.preparedAt,
    });
    Object.defineProperty(window, "__posOfflineAuthorization", {
      configurable: true,
      get() { delete window.__posOfflineAuthorization; return authorization; },
    });
    window.__posOfflineRevocationGuard = guard;
    history.replaceState(null, "", "/pos");
    document.open();
    document.write(html);
    document.close();
  } catch (reason) {
    delete window.__posOfflineAuthorization;
    delete window.__posOfflineRevocationGuard;
    pin.value = "";
    error.textContent = reason instanceof Error ? reason.message : "POS offline belum dapat dibuka.";
    error.hidden = false;
    button.disabled = false;
  }
});

void initialize();
