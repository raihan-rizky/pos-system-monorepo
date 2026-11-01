import { afterEach, beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ snapshots: new Map<string, unknown>() }));
const warmOfflineCheckoutModules = vi.hoisted(() => vi.fn());
vi.mock("../offline-module-preparation", () => ({ warmOfflineCheckoutModules }));
vi.mock("../offline-db", () => ({
  offlineDb: {
    catalogSnapshots: { put: async (snapshot: any) => storage.snapshots.set(snapshot.id, structuredClone(snapshot)) },
  },
}));

import { prepareOfflineCatalog } from "../offline-catalog-preparation";

const identity = { cashierId: "cashier-1", storeId: "store-1" };
beforeEach(() => { storage.snapshots.clear(); warmOfflineCheckoutModules.mockReset().mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllGlobals());

it("saves a complete snapshot only for the signed-in cashier and store", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z",
    products: [{ id: "product-1" }], categories: [{ id: "category-1" }],
  }) }));
  await prepareOfflineCatalog(identity);
  expect(warmOfflineCheckoutModules).toHaveBeenCalledOnce();
  expect(storage.snapshots.get("cashier-1:store-1")).toMatchObject({
    ...identity, products: [{ id: "product-1" }], categories: [{ id: "category-1" }],
  });
});

it("keeps the existing snapshot when checkout modules could not be prepared", async () => {
  storage.snapshots.set("cashier-1:store-1", { old: true });
  warmOfflineCheckoutModules.mockRejectedValueOnce(new Error("Modul kasir belum siap"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [],
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Modul kasir belum siap");
  expect(storage.snapshots.get("cashier-1:store-1")).toEqual({ old: true });
});

it("keeps an existing snapshot when the server returns a different identity", async () => {
  storage.snapshots.set("cashier-1:store-1", { old: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    cashierId: "other", storeId: "store-1", generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [],
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Identitas");
  expect(storage.snapshots.get("cashier-1:store-1")).toEqual({ old: true });
});
