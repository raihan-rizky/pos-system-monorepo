import { afterEach, expect, it, vi } from "vitest";
import { getOfflineCatalogPricing, getOfflineCheckoutCatalog } from "../offline-pricing";
import { offlineDb } from "../offline-db";

const identity = { cashierId: "cashier-1", storeId: "store-1" };
const pricing = { specialPricingEnabled: true, rounding: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [] }, rules: [{
  id: "rule-1", storeId: "store-1", categoryId: "print", scope: "SUBCATEGORY", customerType: "UMUM",
  mode: "PERCENT_DISCOUNT", value: 10, isActive: true, category: { id: "print", name: "PERCETAKAN / PRINT" },
}] };
const snapshot = { id: "cashier-1:store-1", ...identity, generatedAt: "2026-11-01T00:00:00.000Z", products: [], categories: [], pricing };
afterEach(() => vi.restoreAllMocks());

it("loads pricing only from the matching cashier and store snapshot", async () => {
  const get = vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue(snapshot as never);
  await expect(getOfflineCatalogPricing(identity)).resolves.toEqual(pricing);
  expect(get).toHaveBeenCalledWith("cashier-1:store-1");
  get.mockResolvedValue({ ...snapshot, cashierId: "other" } as never);
  await expect(getOfflineCatalogPricing(identity)).rejects.toThrow("siapkan ulang katalog");
});

it("rejects old or incomplete snapshots instead of treating missing rules as empty", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({ ...snapshot, pricing: undefined } as never);
  await expect(getOfflineCatalogPricing(identity)).rejects.toThrow("siapkan ulang katalog");
});

it("accepts a complete snapshot with no active rules", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({ ...snapshot, pricing: { specialPricingEnabled: false, rounding: pricing.rounding, rules: [] } } as never);
  await expect(getOfflineCatalogPricing(identity)).resolves.toEqual({ specialPricingEnabled: false, rounding: pricing.rounding, rules: [] });
});

it("rejects pricing snapshots that lack a valid rounding policy", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({ ...snapshot, pricing: { specialPricingEnabled: true, rules: [] } } as never);
  await expect(getOfflineCatalogPricing(identity)).rejects.toThrow("siapkan ulang katalog");
});

it("rejects malformed rounding and category exceptions instead of using a default", async () => {
  const get = vi.spyOn(offlineDb.catalogSnapshots, "get");
  for (const rounding of [null, { enabled: true, increment: 0, threshold: 50 },
    { enabled: true, increment: 500, threshold: 501 }, { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [""] }]) {
    get.mockResolvedValueOnce({ ...snapshot, pricing: { ...pricing, rounding } } as never);
    await expect(getOfflineCatalogPricing(identity)).rejects.toThrow("siapkan ulang katalog");
  }
});

it("requires the server's explicit rounding exception list", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({ ...snapshot, pricing: {
    ...pricing, rounding: { enabled: true, increment: 500, threshold: 50 },
  } } as never);
  await expect(getOfflineCatalogPricing(identity)).rejects.toThrow("siapkan ulang katalog");
});

it("restores every unit with its own classification and price from the same snapshot as the rules", async () => {
  vi.spyOn(offlineDb.catalogSnapshots, "get").mockResolvedValue({ ...snapshot, products: [{
    id: "pcs", name: "Pulpen", category: { id: "old", name: "ATK" },
    variants: [
      { id: "pcs", unit: "pcs", price: 1000, catalogSubcategoryId: "bot", catalogSubcategory: { legacyCategoryId: "old" } },
      { id: "pak", unit: "pak", price: 9000, catalogSubcategoryId: "print", catalogSubcategory: { legacyCategoryId: null } },
    ],
  }] } as never);
  const result = await getOfflineCheckoutCatalog(identity);
  expect(result.pricing).toEqual(pricing);
  expect(result.products).toEqual([
    expect.objectContaining({ id: "pcs", price: 1000, catalogSubcategoryId: "bot", category: { id: "old", name: "ATK" } }),
    expect.objectContaining({ id: "pak", price: 9000, catalogSubcategoryId: "print", category: { id: "old", name: "ATK" } }),
  ]);
});
