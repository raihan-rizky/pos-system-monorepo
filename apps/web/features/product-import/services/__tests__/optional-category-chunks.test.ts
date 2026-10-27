import { beforeEach, describe, expect, it, vi } from "vitest";
import { importPricingDatabase } from "./import-pricing-database";

const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import { commitProductImportChunk, commitProductImportInChunks, finishProductImportCommit, productImportCommitSchema, productImportStartSchema, startProductImportCommit } from "../product-import-commit-service";

const actor = { id: "owner-1", storeId: "store-main" };

describe("categoryless product import persistence boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves resolved categories across three separate commit chunks", async () => {
    const database = importPricingDatabase();
    database.tx.category.findMany.mockResolvedValue([{ id: "cat", name: "ATK" }, { id: "uncategorized", name: "Tanpa Kategori" }]);
    transact.mockImplementation(database.transaction);
    const input = productImportStartSchema.parse({
      rows: [
        { rowNumber: 2, name: "Produk Baru A", sku: "NEW-A", price: 1000, unit: "pcs" },
        { rowNumber: 3, name: "HVS A4", sku: "HVS-A4-RIM", price: 60000, costPrice: 40000, unit: "rim" },
        { rowNumber: 4, name: "Produk Baru B", sku: "NEW-B", category: "   ", price: 2000, unit: "pcs" },
      ], decisions: {}, createMissingCategories: false, chunkSize: 1,
    });
    const start = await startProductImportCommit(input, actor);
    for (const cursor of [0, 1, 2]) {
      await commitProductImportChunk({ batchOperationId: start.batchOperationId, cursor, chunkSize: 1 }, actor);
    }
    const result = await finishProductImportCommit({ batchOperationId: start.batchOperationId }, actor);
    expect(result).toMatchObject({ createdProductCount: 2, updatedProductCount: 1, skippedRowCount: 0 });
    expect(database.products).toHaveLength(4);
    expect(database.products.find(p => p.sku === "NEW-A")).toMatchObject({ categoryId: "uncategorized" });
    expect(database.products.find(p => p.sku === "NEW-B")).toMatchObject({ categoryId: "uncategorized" });
    const existing = database.products.find(p => p.sku === "HVS-A4-RIM");
    expect(existing.categoryId).toBe("cat");
    expect(Number(existing.price)).toBe(60000);
  });

  it("does not create a fallback category or product for a skipped categoryless row", async () => {
    const database = importPricingDatabase();
    const originalProducts = structuredClone(database.products);
    transact.mockImplementation(database.transaction);
    const result = await commitProductImportInChunks(productImportCommitSchema.parse({
      rows: [{ rowNumber: 2, name: "Produk Dilewati", sku: "SKIP", price: 1000, unit: "pcs" }],
      decisions: { "2": "skip" }, createMissingCategories: false,
    }), actor);
    expect(result).toMatchObject({ skippedRowCount: 1, createdCategoryCount: 0, createdProductCount: 0, updatedProductCount: 0 });
    expect(database.products).toEqual(originalProducts);
  });
});
