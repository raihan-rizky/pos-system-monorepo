import { afterEach, expect, it, vi } from "vitest";
import { getCachedCatalogCategories, getCachedCatalogProducts, offlineDb } from "../offline-db";

const identity = { cashierId: "cashier-1", storeId: "store-1" };

afterEach(() => vi.restoreAllMocks());

it("does not substitute a partial legacy product cache for an unprepared cashier", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue(undefined);
  const legacy = vi.spyOn(offlineDb.catalogProducts, "toArray").mockResolvedValue([
    { id: "partial-product", storeId: "store-1", updatedAt: "2026-11-01" },
  ]);

  await expect(getCachedCatalogProducts(undefined, undefined, false, identity))
    .rejects.toThrow("Katalog offline belum disiapkan untuk kasir ini");
  expect(legacy).not.toHaveBeenCalled();
});

it("does not substitute legacy categories for an unprepared cashier", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue(undefined);
  const legacy = vi.spyOn(offlineDb.catalogCategories, "toArray").mockResolvedValue([
    { id: "partial-category" },
  ]);

  await expect(getCachedCatalogCategories(identity))
    .rejects.toThrow("Katalog offline belum disiapkan untuk kasir ini");
  expect(legacy).not.toHaveBeenCalled();
});

it("rejects a snapshot whose recorded identity does not match its lookup key", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({
    id: "cashier-1:store-1", cashierId: "cashier-2", storeId: "store-1",
    generatedAt: "2026-11-01T00:00:00.000Z",
    products: [{ id: "other-product" }], categories: [{ id: "other-category" }],
  });

  await expect(getCachedCatalogProducts(undefined, undefined, false, identity))
    .rejects.toThrow("Katalog offline belum disiapkan untuk kasir ini");
  await expect(getCachedCatalogCategories(identity))
    .rejects.toThrow("Katalog offline belum disiapkan untuk kasir ini");
});

it("returns the prepared snapshot belonging to the cashier and store", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({
    id: "cashier-1:store-1", ...identity, generatedAt: "2026-11-01T00:00:00.000Z",
    products: [{ id: "product-1", name: "Kertas" }], categories: [{ id: "category-1" }],
  });

  expect(await getCachedCatalogProducts(undefined, undefined, false, identity))
    .toMatchObject([{ id: "product-1" }]);
  expect(await getCachedCatalogCategories(identity)).toMatchObject([{ id: "category-1" }]);
});
