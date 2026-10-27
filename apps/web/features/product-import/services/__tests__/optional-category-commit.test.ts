import { beforeEach, describe, expect, it, vi } from "vitest";
import { importPricingDatabase } from "./import-pricing-database";

const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { commitProductImportInChunks, productImportCommitSchema } from "../product-import-commit-service";
import { previewImportGroupPricing } from "../import-pricing-preview";
import { normalizeImportRows } from "../../helpers/import-core";
import { resolveProductImportAutoDecisions } from "../../helpers/auto-decisions";

const actor = { id: "owner-1", storeId: "store-main" };

describe("persisting product imports without categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the fallback category and products even when automatic category creation is unchecked", async () => {
    const database = importPricingDatabase();
    const categories = [{ id: "cat", name: "ATK" }];
    database.tx.category.findMany.mockImplementation(async () => structuredClone(categories));
    database.tx.category.upsert = vi.fn(async ({ where, create }) => {
      const category = categories.find(({ name }) => name === where.name) ?? { ...create, id: "uncategorized" };
      if (!categories.includes(category)) categories.push(category);
      return category;
    });
    transact.mockImplementation(database.transaction);

    const input = productImportCommitSchema.parse({
      rows: [
        { rowNumber: 2, name: "Produk Baru A", sku: "NEW-A", price: 1000, unit: "pcs" },
        { rowNumber: 3, name: "Produk Baru B", sku: "NEW-B", category: "", price: 2000, unit: "pcs" },
      ], decisions: {}, createMissingCategories: false,
    });
    await commitProductImportInChunks(input, actor);

    expect(categories).toEqual([{ id: "cat", name: "ATK" }, expect.objectContaining({ id: "uncategorized", name: "Tanpa Kategori" })]);
    expect(database.products.filter(({ sku }) => sku.startsWith("NEW-")).map(({ categoryId }) => categoryId)).toEqual(["uncategorized", "uncategorized"]);
  });

  it("keeps an existing SKU in its current category through all commit chunks", async () => {
    const database = importPricingDatabase();
    transact.mockImplementation(database.transaction);
    const input = productImportCommitSchema.parse({
      rows: [{ rowNumber: 2, name: "HVS A4", sku: "HVS-A4-RIM", price: 60000, costPrice: 40000, unit: "rim" }],
      decisions: {}, createMissingCategories: false,
    });
    await commitProductImportInChunks(input, actor);
    expect(database.products).toHaveLength(2);
    const saved = database.products.find(({ sku }) => sku === "HVS-A4-RIM");
    expect(saved.categoryId).toBe("cat");
    expect(Number(saved.price)).toBe(60000);
  });

  it("reuses Tanpa Kategori and keeps explicit category creation subject to its existing setting", async () => {
    const database = importPricingDatabase();
    database.tx.category.findMany.mockResolvedValue([{ id: "cat", name: "ATK" }, { id: "uncategorized", name: "Tanpa Kategori" }]);
    transact.mockImplementation(database.transaction);
    const input = productImportCommitSchema.parse({
      rows: [{ rowNumber: 2, name: "Produk Baru", sku: "NEW", price: 1000, unit: "pcs" }],
      decisions: {}, createMissingCategories: false,
    });
    await commitProductImportInChunks(input, actor);
    expect(database.products.find(({ sku }) => sku === "NEW")).toMatchObject({ categoryId: "uncategorized" });

    await expect(commitProductImportInChunks({ ...input, rows: [{ ...input.rows[0], sku: "EXPLICIT", category: "Kategori Baru" }] }, actor)).rejects.toThrow("MISSING_CATEGORIES:Kategori Baru");
  });

  it("keeps categoryless ambiguity unresolved when the user recalculates the preview", async () => {
    const database = importPricingDatabase();
    database.products.push({ ...database.products[0], id: "other-rim", sku: "OTHER", categoryId: "other-category", category: { name: "Kertas" }, stockGroupId: null });
    const normalized = normalizeImportRows([{ name: "HVS A4", sku: "IMPORT-NEW", price: 50000, costPrice: 40000, unit: "rim" }], new Map(), new Set());
    const rows = resolveProductImportAutoDecisions({
      rows: normalized.rows, existingSkus: new Set(database.products.map(({ sku }) => sku)),
      existingProducts: database.products.map((product) => ({ ...product, category: product.category?.name ?? "ATK", price: Number(product.price), costPrice: Number(product.costPrice) })),
    });
    expect(rows[0].autoAction).toBe("conflict");
    const recalculated = await previewImportGroupPricing(database.tx, { rows, decisions: {}, storeId: "store-main" });
    expect(recalculated[0].autoAction).toBe("conflict");
    expect(recalculated[0].matchedProductId).toBeUndefined();
  });

  it.each(["Bk Tulis", "Buku   Tulis", "BUKU TULIS"])("preserves ambiguity for normalized database names (%s) when recalculating preview", async (storedName) => {
    const database = importPricingDatabase();
    database.tx.category.findMany.mockResolvedValue([{ id: "cat", name: "ATK" }, { id: "other-category", name: "Kertas" }]);
    database.products[0].name = storedName;
    database.products.push({ ...database.products[0], id: "other-rim", name: "Buku Tulis", sku: "OTHER", categoryId: "other-category", category: { name: "Kertas" }, stockGroupId: null });
    const source = { name: "Buku Tulis", sku: "IMPORT-NEW", price: 50000, costPrice: 40000, unit: "rim" };
    const normalized = normalizeImportRows([source], new Map(), new Set());
    const rows = resolveProductImportAutoDecisions({
      rows: normalized.rows, existingSkus: new Set(database.products.map(({ sku }) => sku)),
      existingProducts: database.products.map((product) => ({ ...product, category: product.category?.name ?? "ATK", price: Number(product.price), costPrice: Number(product.costPrice) })),
    });
    expect(rows[0].autoAction).toBe("conflict");

    const recalculated = await previewImportGroupPricing(database.tx, { rows, decisions: {}, storeId: "store-main" });
    expect(recalculated[0].autoAction).toBe("conflict");
    expect(recalculated[0].matchedProductId).toBeUndefined();
  });

  it.each(["Bk Tulis", "Buku   Tulis", "BUKU TULIS"])("rejects unresolved categoryless ambiguity for normalized database names (%s) at commit", async (storedName) => {
    const database = importPricingDatabase();
    database.tx.category.findMany.mockResolvedValue([{ id: "cat", name: "ATK" }, { id: "other-category", name: "Kertas" }]);
    database.products[0].name = storedName;
    database.products.push({ ...database.products[0], id: "other-rim", name: "Buku Tulis", sku: "OTHER", categoryId: "other-category", category: { name: "Kertas" }, stockGroupId: null });
    transact.mockImplementation(database.transaction);
    const input = productImportCommitSchema.parse({
      rows: [{ rowNumber: 2, name: "Buku Tulis", sku: "IMPORT-NEW", price: 60000, costPrice: 40000, unit: "rim" }],
      decisions: {}, createMissingCategories: false,
    });
    await expect(commitProductImportInChunks(input, actor)).rejects.toThrow("ROW_CONFLICT:2");
  });

  it("matches a unique abbreviated name within the current store through preview and commit", async () => {
    const database = importPricingDatabase();
    database.products[0].name = "Bk Tulis";
    database.products.push({ ...database.products[0], id: "other-store-rim", name: "Buku Tulis", sku: "OTHER", storeId: "store-other", categoryId: "other-category", category: { name: "Kertas" }, stockGroupId: null });
    const source = { name: "Buku Tulis", sku: "IMPORT-NEW", price: 60000, costPrice: 40000, unit: "rim" };
    const normalized = normalizeImportRows([source], new Map(), new Set());
    const recalculated = await previewImportGroupPricing(database.tx, { rows: normalized.rows, decisions: {}, storeId: "store-main" });
    expect(recalculated[0]).toMatchObject({ autoAction: "auto_price_update", matchedProductId: database.products[0].id, category: "ATK" });

    transact.mockImplementation(database.transaction);
    await commitProductImportInChunks(productImportCommitSchema.parse({ rows: [{ rowNumber: 2, ...source }], decisions: {}, createMissingCategories: false }), actor);
    expect(database.products).toHaveLength(3);
    expect(Number(database.products[0].price)).toBe(60000);
    expect(Number(database.products.find(({ id }) => id === "other-store-rim").price)).toBe(50000);
  });
});
