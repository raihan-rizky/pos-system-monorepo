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
const pricing = { specialPricingEnabled: true, rounding: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [] }, rules: [{
  id: "rule-1", storeId: "store-1", categoryId: "print", scope: "SUBCATEGORY", customerType: "UMUM",
  mode: "PERCENT_DISCOUNT", value: 10, isActive: true, category: { id: "print", name: "PERCETAKAN / PRINT" },
}] };
beforeEach(() => { storage.snapshots.clear(); warmOfflineCheckoutModules.mockReset().mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllGlobals());

it("saves a complete snapshot only for the signed-in cashier and store", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z",
    products: [{ id: "product-1" }], categories: [{ id: "category-1" }], pricing,
  }) }));
  await prepareOfflineCatalog(identity);
  expect(warmOfflineCheckoutModules).toHaveBeenCalledOnce();
  expect(storage.snapshots.get("cashier-1:store-1")).toMatchObject({
    ...identity, products: [{ id: "product-1" }], categories: [{ id: "category-1" }], pricing,
  });
});

it("keeps the existing snapshot when checkout modules could not be prepared", async () => {
  storage.snapshots.set("cashier-1:store-1", { old: true });
  warmOfflineCheckoutModules.mockRejectedValueOnce(new Error("Modul kasir belum siap"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [], pricing,
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Modul kasir belum siap");
  expect(storage.snapshots.get("cashier-1:store-1")).toEqual({ old: true });
});

it("does not replace a complete snapshot with a response missing pricing data", async () => {
  storage.snapshots.set("cashier-1:store-1", { old: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [],
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Data katalog belum lengkap");
  expect(storage.snapshots.get("cashier-1:store-1")).toEqual({ old: true });
});

it("rejects a pricing rule from a different store", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [],
    pricing: { ...pricing, rules: [{ ...pricing.rules[0], storeId: "store-2" }] },
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Data katalog belum lengkap");
  expect(storage.snapshots.size).toBe(0);
});

it("keeps the old snapshot when a catalog response omits rounding policy", async () => {
  storage.snapshots.set("cashier-1:store-1", { old: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [],
    pricing: { specialPricingEnabled: true, rules: [] },
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Data katalog belum lengkap");
  expect(storage.snapshots.get("cashier-1:store-1")).toEqual({ old: true });
});

it.each([{}, { rules: [] }, { rules: [], rounding: null }])("rejects incomplete pricing snapshots %j without throwing a raw error", async invalid => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [], pricing: invalid,
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Data katalog belum lengkap");
});

it("keeps an existing snapshot when the server returns a different identity", async () => {
  storage.snapshots.set("cashier-1:store-1", { old: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    cashierId: "other", storeId: "store-1", generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [],
  }) }));
  await expect(prepareOfflineCatalog(identity)).rejects.toThrow("Identitas");
  expect(storage.snapshots.get("cashier-1:store-1")).toEqual({ old: true });
});
