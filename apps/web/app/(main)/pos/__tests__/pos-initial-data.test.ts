import { afterEach, describe, expect, it, vi } from "vitest";
import { matchesSearchTokens, parseSearchQuery } from "@/features/pos-search/pos-search";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  categoryFindMany: vi.fn(),
  storeSettingsFindUnique: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: mocks.productFindMany,
      count: mocks.productCount,
    },
    category: {
      findMany: mocks.categoryFindMany,
    },
    storeSettings: {
      findUnique: mocks.storeSettingsFindUnique,
    },
  },
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.requirePermission,
}));

import { loadPOSInitialData } from "../pos-initial-data";

function projectSelectedFields<T extends Record<string, unknown>>(
  row: T,
  select: Record<string, unknown>,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(select).flatMap(([key, selection]) => {
      const value = row[key];
      if (selection === true) return [[key, value]];
      if (
        selection &&
        typeof selection === "object" &&
        "select" in selection
      ) {
        if (value == null) return [[key, value]];
        if (typeof value === "object") {
          return [[
            key,
            projectSelectedFields(
              value as Record<string, unknown>,
              (selection as { select: Record<string, unknown> }).select,
            ),
          ]];
        }
      }
      return [];
    }),
  ) as Partial<T>;
}

describe("loadPOSInitialData", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("includes the catalog snapshot timestamp for client cache freshness", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requirePermission.mockResolvedValue({ storeId: "store-main" });
    mocks.productFindMany.mockResolvedValue([]);
    mocks.productCount.mockResolvedValue(0);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.storeSettingsFindUnique.mockResolvedValue({ shiftEnabled: false });
    const startedAt = Date.now();
    const result = await loadPOSInitialData();
    expect(result).toHaveProperty("productsUpdatedAt", expect.any(Number));
    expect(result.productsUpdatedAt).toBeGreaterThanOrEqual(startedAt);
    expect(result.productsUpdatedAt).toBeLessThanOrEqual(Date.now());
  });

  it("keeps selected product and variant barcodes searchable in the seeded catalog", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "0");
    mocks.requirePermission.mockResolvedValue({ storeId: "store-main" });
    const fixtures = [
      {
        id: "pack", storeId: "store-main", name: "Kertas A4", sku: "pack", barcode: "890111", price: 50000,
        costPrice: 9000, hargaDinas: null, hargaAgen: null, stock: 10, minStock: 0, unit: "pack", size: null,
        material: null, imageUrl: null, isActive: true, brandId: null, stockGroupId: null,
        unitMultiplierToBase: 1, conversionNeedsReview: false,
        category: { id: "cat-paper", name: "Kertas", icon: null, color: null }, brand: null, stockGroup: null,
      },
      {
        id: "sheet", storeId: "store-main", name: "Kertas A4", sku: "sheet", barcode: "890222", price: 5000,
        costPrice: 900, hargaDinas: null, hargaAgen: null, stock: 5, minStock: 0, unit: "lembar", size: null,
        material: null, imageUrl: null, isActive: true, brandId: null, stockGroupId: null,
        unitMultiplierToBase: 1, conversionNeedsReview: false,
        category: { id: "cat-paper", name: "Kertas", icon: null, color: null }, brand: null, stockGroup: null,
      },
    ];
    mocks.productFindMany.mockImplementation(async ({ select }) =>
      fixtures.map((fixture) => projectSelectedFields(fixture, select)),
    );
    mocks.productCount.mockResolvedValue(2);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.storeSettingsFindUnique.mockResolvedValue({ shiftEnabled: true });

    const result = await loadPOSInitialData();
    const seededProduct = result.products?.data[0];

    if (!seededProduct) throw new Error("Expected the initial catalog to contain a seeded product");
    const variants = seededProduct.variants;
    if (!variants) throw new Error("Expected the seeded product to contain grouped variants");
    const sheetVariant = variants.find((variant) => variant.id === "sheet");
    if (!sheetVariant) throw new Error("Expected the sheet variant to be present");

    expect(seededProduct.barcode).toBe("890111");
    expect(variants.map((variant) => variant.barcode)).toEqual(["890111", "890222"]);
    expect(matchesSearchTokens(seededProduct, parseSearchQuery("890111"))).toBe(true);
    expect(matchesSearchTokens(sheetVariant, parseSearchQuery("890222"))).toBe(true);
  });

  it.each(["Kertas A4 isi 500 lembar", null])("shares the saved description (%s) across the initial catalog and each variant", async (description) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "0");
    mocks.requirePermission.mockResolvedValue({ storeId: "store-main" });
    const product = {
      id: "rim", storeId: "store-main", name: "Kertas A4", sku: "rim",
      description, price: 50000, costPrice: 9000, unit: "rim", stock: 10,
      category: { id: "cat-paper", name: "Kertas" }, stockGroupId: null,
      stockGroup: null, isActive: true,
    };
    mocks.productFindMany.mockImplementation(async ({ select }) => [
      projectSelectedFields(product, select),
      projectSelectedFields({ ...product, id: "pcs", unit: "pcs", stock: 5, description: "Satu lembar" }, select),
    ]);
    mocks.productCount.mockResolvedValue(2);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.storeSettingsFindUnique.mockResolvedValue({ shiftEnabled: true });

    const result = await loadPOSInitialData();
    const group = result.products?.data[0];
    const sharedDescription = description ?? "Satu lembar";
    expect(group?.description).toBe(sharedDescription);
    expect(group?.variants?.map((variant) => variant.description)).toEqual([sharedDescription, sharedDescription]);
  });

  it("loads smallest-unit modal outside the first page and groups initial variants like the API", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requirePermission.mockResolvedValue({ storeId: "store-main" });
    const rim = { id: "rim", storeId: "store-main", name: "Kertas A4", sku: "rim", price: 50000, costPrice: 9000, unit: "rim", stock: 10, stockGroupId: "paper", category: { id: "cat-paper", name: "Kertas", icon: null, color: null }, stockGroup: { id: "paper", baseUnit: "pcs", baseStock: 5000 }, isActive: true };
    mocks.productFindMany.mockImplementation(async (args) => args.where.OR ? [rim, { ...rim, id: "pcs", unit: "pcs", costPrice: 700 }] : [rim]);
    mocks.productCount.mockResolvedValue(30);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.storeSettingsFindUnique.mockResolvedValue({ shiftEnabled: false });
    const result = await loadPOSInitialData();
    expect(result.products?.data[0]).toMatchObject({ baseCostPrice: 700, baseCostUnit: "pcs", costPrice: 9000, defaultVariant: { id: "rim" } });
    expect(result.products?.data[0].variants?.[0].baseCostPrice).toBe(700);
    expect(result.products?.pagination.total).toBe(30);
    expect(result.shiftEnabled).toBe(false);
  });

  it("returns shift mode disabled from store settings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requirePermission.mockResolvedValue({ storeId: "store-main" });
    mocks.productFindMany.mockResolvedValue([]);
    mocks.productCount.mockResolvedValue(0);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.storeSettingsFindUnique.mockResolvedValue({ shiftEnabled: false });

    await expect(loadPOSInitialData()).resolves.toMatchObject({
      shiftEnabled: false,
      categories: [],
    });
  });

  it("does not allow E2E auth bypass in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    mocks.requirePermission.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(loadPOSInitialData()).resolves.toEqual({
      products: null,
      categories: [],
      shiftEnabled: true,
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("product", "read");
  });
});
