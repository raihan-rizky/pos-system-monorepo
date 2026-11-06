import { listOfflinePages, openOfflinePage } from "/offline-vault.mjs";

const status = document.getElementById("offline-status");
const form = document.getElementById("offline-unlock");
const select = document.getElementById("offline-account");
const pin = document.getElementById("offline-pin");
const error = document.getElementById("offline-error");
const button = form.querySelector("button");
let pages = [];

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
    const html = await openOfflinePage(page, pin.value);
    pin.value = "";
    if (!navigator.serviceWorker?.controller) throw new Error("POS offline belum siap. Hubungkan kembali dan siapkan perangkat.");
    history.replaceState(null, "", "/pos");
    document.open();
    document.write(html);
    document.close();
  } catch (reason) {
    pin.value = "";
    error.textContent = reason instanceof Error ? reason.message : "POS offline belum dapat dibuka.";
    error.hidden = false;
    button.disabled = false;
  }
});

void initialize();
