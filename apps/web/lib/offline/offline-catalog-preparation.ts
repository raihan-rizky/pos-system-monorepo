"use client";

import { offlineDb, type OfflineCatalogIdentity, type OfflineCatalogSnapshot } from "./offline-db";
import { warmOfflineCheckoutModules } from "./offline-module-preparation";

export async function prepareOfflineCatalog(identity: OfflineCatalogIdentity) {
  const response = await fetch("/api/offline-sync/catalog", { cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "Katalog belum dapat disiapkan.");
  }
  const result = await response.json() as Omit<OfflineCatalogSnapshot, "id">;
  if (result.cashierId !== identity.cashierId || result.storeId !== identity.storeId) {
    throw new Error("Identitas kasir atau toko berubah. Masuk kembali dan coba lagi.");
  }
  if (!Array.isArray(result.products) || !Array.isArray(result.categories) ||
      !Number.isFinite(Date.parse(result.generatedAt)) ||
      [...result.products, ...result.categories].some((item) => !item || typeof item.id !== "string")) {
    throw new Error("Data katalog belum lengkap. Coba siapkan kembali saat online.");
  }
  await warmOfflineCheckoutModules();
  const snapshot = { ...result, id: `${identity.cashierId}:${identity.storeId}` };
  // One IndexedDB write replaces the old snapshot only after the entire response is validated.
  await offlineDb.catalogSnapshots.put(snapshot);
  return snapshot;
}
