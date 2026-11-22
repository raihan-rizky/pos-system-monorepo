import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyClassificationMove, previewClassificationMove } from "../classification-move";

const fixture = vi.hoisted(() => ({ state: {} as Record<string, any[]> }));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: async (run: (tx: any) => Promise<unknown>) => {
      const state = structuredClone(fixture.state);
      const tx = {
        productSubcategory: {
          findUnique: async ({ where }: any) => state.subcategories.find((row) => row.id === where.id) ?? null,
        },
        product: {
          findMany: async ({ where }: any) => state.products.filter((row) =>
            where.OR
              ? where.OR.some((group: any) => row.storeId === group.storeId && group.stockGroupId.in.includes(row.stockGroupId))
              : row.storeId === where.storeId && where.id.in.includes(row.id),
          ).sort((a, b) => a.id.localeCompare(b.id)),
          updateMany: async ({ where, data }: any) => {
            const selected = state.products.filter((row) => row.storeId === where.storeId && where.id.in.includes(row.id));
            selected.forEach((row) => Object.assign(row, data));
            return { count: selected.length };
          },
        },
        categoryCustomerPricingRule: { findMany: async () => state.rules },
        subcategoryCustomerPricingRule: { findMany: async () => state.subcategoryRules },
        storeSettings: { findUnique: async () => state.settings[0] ?? null },
      };
      const result = await run(tx);
      fixture.state = state;
      return result;
    },
  },
}));

const actor = { id: "owner", role: "OWNER", storeId: "store-a" };
const legacyCategory = { id: "legacy-bot", name: "BOT" };

beforeEach(() => {
  vi.stubEnv("CATEGORY_PREVIEW_SECRET", "classification-move-test-secret");
  fixture.state = {
    subcategories: [
      { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null },
      { id: "old-printing", group: "PERCETAKAN", name: "SPANDUK", legacyCategoryId: null },
    ],
    products: [
      { id: "pcs", name: "Pulpen", unit: "pcs", isActive: true, imageUrl: null, categoryId: "legacy-bot", category: legacyCategory, catalogSubcategoryId: null, catalogSubcategory: null, stockGroupId: "shared", stockGroup: { baseUnit: "pcs", storeId: "store-a" }, storeId: "store-a", price: 1000, costPrice: 400, hargaAgen: 800, updatedAt: new Date("2026-11-12T00:00:00Z") },
      { id: "pak", name: "Pulpen", unit: "pak", isActive: false, imageUrl: null, categoryId: "legacy-bot", category: legacyCategory, catalogSubcategoryId: null, catalogSubcategory: null, stockGroupId: "shared", stockGroup: { baseUnit: "pcs", storeId: "store-a" }, storeId: "store-a", price: 10000, costPrice: 4000, updatedAt: new Date("2026-11-12T00:00:00Z") },
      { id: "foreign", name: "Pulpen", unit: "pcs", isActive: true, imageUrl: null, categoryId: "legacy-bot", category: legacyCategory, catalogSubcategoryId: null, catalogSubcategory: null, stockGroupId: "foreign-group", storeId: "store-b", price: 1000, updatedAt: new Date("2026-11-12T00:00:00Z") },
    ],
    rules: [],
    subcategoryRules: [],
    settings: [{ specialPricingEnabled: true, priceRoundingEnabled: false, priceRoundingIncrement: 500, priceRoundingThreshold: 50, priceRoundingExcludedCategories: [] }],
  };
});

describe("classification move", () => {
  it("moves only a selected unit while preserving its stock group and legacy category", async () => {
    const preview = await previewClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "print" });
    expect(preview.totals).toMatchObject({ selected: 1, moving: 1, active: 1, inactive: 0 });
    await applyClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "print", token: preview.token });
    expect(fixture.state.products.find((row) => row.id === "pcs")).toMatchObject({ catalogSubcategoryId: "print", stockGroupId: "shared", categoryId: "legacy-bot" });
    expect(fixture.state.products.find((row) => row.id === "pak")).toMatchObject({ catalogSubcategoryId: null, stockGroupId: "shared", categoryId: "legacy-bot" });
  });

  it("counts selected inactive units explicitly", async () => {
    const preview = await previewClassificationMove(actor, { productIds: ["pcs", "pak"], subcategoryId: "print" });
    expect(preview.totals).toMatchObject({ selected: 2, active: 1, inactive: 1 });
  });

  it("rejects a unit belonging to another store", async () => {
    await expect(previewClassificationMove(actor, { productIds: ["pcs", "foreign"], subcategoryId: "print" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a printing destination outside the supported choices", async () => {
    fixture.state.subcategories.find((row) => row.id === "old-printing")!.name = "FOTOKOPI";
    await expect(previewClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "old-printing" })).rejects.toMatchObject({ status: 409 });
  });

  it("accepts SPANDUK as a supported printing destination", async () => {
    const preview = await previewClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "old-printing" });
    expect(preview.target).toMatchObject({ group: "PERCETAKAN", name: "SPANDUK" });
  });

  it("requires a fresh preview if a selected product changes", async () => {
    const preview = await previewClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "print" });
    fixture.state.products.find((row) => row.id === "pcs")!.updatedAt = new Date("2026-11-13T00:00:00Z");
    await expect(applyClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "print", token: preview.token })).rejects.toMatchObject({ status: 409 });
    expect(fixture.state.products.find((row) => row.id === "pcs")!.catalogSubcategoryId).toBeNull();
  });

  it("shows actual changes by customer type while preserving manual member prices", async () => {
    const rule = { customerType: null, customerTypes: ["UMUM", "AGEN"], unit: null, units: [], brandId: null, brand: null, mode: "FLAT_DISCOUNT", discountPercent: 0, isActive: true, updatedAt: new Date("2026-11-12T00:00:00Z") };
    fixture.state.rules.push({ ...rule, id: "old", categoryId: "legacy-bot", category: { name: "BOT" }, value: 100 });
    fixture.state.subcategoryRules.push({ ...rule, id: "new", subcategoryId: "print", subcategory: { group: "PERCETAKAN", name: "PRINT" }, value: 300 });
    const preview = await previewClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "print" });
    expect(preview.pricingImpact).toEqual({ changed: 1, examples: [expect.objectContaining({ unitName: "Pulpen (pcs)", customerType: "UMUM", before: 900, after: 700 })] });
  });

  it("reports the old and new rules when their effective prices are equal", async () => {
    const rule = { customerType: null, customerTypes: ["UMUM"], unit: null, units: [], brandId: null, brand: null, mode: "FLAT_DISCOUNT", discountPercent: 0, isActive: true, updatedAt: new Date("2026-11-12T00:00:00Z") };
    fixture.state.rules.push({ ...rule, id: "old", categoryId: "legacy-bot", category: { name: "BOT" }, value: 100 });
    fixture.state.subcategoryRules.push({ ...rule, id: "new", subcategoryId: "print", subcategory: { group: "PERCETAKAN", name: "PRINT" }, value: 100 });
    const preview = await previewClassificationMove(actor, { productIds: ["pcs"], subcategoryId: "print" });
    expect(preview.pricingImpact.changed).toBe(1);
    expect(preview.pricingImpact.examples).toEqual([expect.objectContaining({
      unitId: "pcs", customerType: "UMUM", before: 900, after: 900,
      beforeRule: expect.objectContaining({ id: "old", scope: "CATEGORY", label: expect.stringContaining("BOT") }),
      afterRule: expect.objectContaining({ id: "new", scope: "SUBCATEGORY", label: expect.stringContaining("PRINT") }),
    })]);
  });

  it("returns every affected unit rather than truncating impacts after ten", async () => {
    const rule = { customerType: null, customerTypes: ["UMUM"], unit: null, units: [], brandId: null, brand: null, mode: "FLAT_DISCOUNT", discountPercent: 0, isActive: true, updatedAt: new Date("2026-11-12T00:00:00Z") };
    fixture.state.rules.push({ ...rule, id: "old", categoryId: "legacy-bot", category: { name: "BOT" }, value: 100 });
    fixture.state.subcategoryRules.push({ ...rule, id: "new", subcategoryId: "print", subcategory: { group: "PERCETAKAN", name: "PRINT" }, value: 300 });
    const products = Array.from({ length: 13 }, (_, index) => ({ ...fixture.state.products[0], id: `unit-${String(index).padStart(2, "0")}`, stockGroupId: null, stockGroup: null }));
    fixture.state.products.push(...products);
    const preview = await previewClassificationMove(actor, { productIds: products.map((item) => item.id), subcategoryId: "print" });
    expect(preview.pricingImpact.changed).toBe(13);
    expect(preview.pricingImpact.examples.map((item: { unitId: string }) => item.unitId)).toEqual(products.map((item) => item.id));
  });

  it.each(["rule", "settings", "base cost"]) ("requires a fresh preview when %s changes", async (change) => {
    const rule = { id: "new", subcategoryId: "print", subcategory: { group: "PERCETAKAN", name: "PRINT" }, customerType: null, customerTypes: ["UMUM"], unit: null, units: [], brandId: null, brand: null, mode: "COST_PLUS_FLAT", value: 300, discountPercent: 0, isActive: true, updatedAt: new Date("2026-11-12T00:00:00Z") };
    fixture.state.subcategoryRules.push(rule);
    const preview = await previewClassificationMove(actor, { productIds: ["pak"], subcategoryId: "print" });
    if (change === "rule") fixture.state.subcategoryRules[0].value = 350;
    if (change === "settings") fixture.state.settings[0].specialPricingEnabled = false;
    if (change === "base cost") fixture.state.products.find((row) => row.id === "pcs")!.costPrice = 500;
    await expect(applyClassificationMove(actor, { productIds: ["pak"], subcategoryId: "print", token: preview.token })).rejects.toMatchObject({ status: 409 });
    expect(fixture.state.products.find((row) => row.id === "pak")!.catalogSubcategoryId).toBeNull();
  });

  it("rejects a repeated product ID instead of counting it twice", async () => {
    await expect(previewClassificationMove(actor, { productIds: ["pcs", "pcs"], subcategoryId: "print" })).rejects.toMatchObject({ status: 422 });
  });
});
