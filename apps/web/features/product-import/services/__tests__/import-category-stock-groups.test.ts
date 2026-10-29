import { describe, expect, it, vi } from "vitest";

const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));

import { importPricingDatabase } from "./import-pricing-database";
import { commitProductImportChunk, productImportStartSchema, startProductImportCommit } from "../product-import-commit-service";

const user = { id: "user", storeId: "store-main" };

function setup() {
  const database = importPricingDatabase();
  database.tx.category.findMany.mockResolvedValue([{ id: "cat", name: "ATK" }, { id: "next", name: "Baru" }]);
  database.addRow("rim", 2, 0, 60000, 45000, "update");
  database.planned[0].rowData.category = "Baru";
  transact.mockImplementation(database.transaction);
  return database;
}

describe("category changes in product imports", () => {
  it("rejects a category change before starting an import", async () => {
    const database = setup();
    const row = database.planned[0].rowData;
    database.planned.splice(0);
    const before = structuredClone({ products: database.products, groups: database.groups, batches: database.batches });
    const input = productImportStartSchema.parse({ rows: [row], decisions: { "2": "update" } });

    await expect(startProductImportCommit(input, user)).rejects.toThrow(/Pindahkan seluruh grup.*Produk/);
    expect({ products: database.products, groups: database.groups, batches: database.batches }).toEqual(before);
    expect(database.planned).toEqual([]);
  });

  it("rejects an existing planned category change without changing stock or batch state", async () => {
    const database = setup();
    const before = structuredClone({ products: database.products, groups: database.groups, batches: database.batches, planned: database.planned });

    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toThrow(/Pindahkan seluruh grup.*Produk/);
    expect({ products: database.products, groups: database.groups, batches: database.batches, planned: database.planned }).toEqual(before);
    expect(database.items).toEqual([]);
  });

  it("allows skipped rows even when their imported category differs", async () => {
    const database = setup();
    database.planned[0].commitAction = "skip";
    const before = structuredClone({ products: database.products, groups: database.groups });

    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect({ products: database.products, groups: database.groups }).toEqual(before);
  });

  it("keeps a grouped update in its existing group without overwriting a matching group", async () => {
    const database = setup();
    database.planned[0].rowData.category = "ATK";
    database.planned[0].rowData.price = 50000;
    database.planned[0].rowData.costPrice = 40000;
    database.groups[0].groupKey = "manual:original";
    database.groups.push({ ...structuredClone(database.groups[0]), id: "other-group", groupKey: "hvs a4|cat||", baseStock: 999 });
    const groupId = database.products.find(p => p.id === "rim")!.stockGroupId;

    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(database.products.find(p => p.id === "rim")!.stockGroupId).toBe(groupId);
    expect(database.groups).toHaveLength(2);
    expect(database.groups.find(g => g.id === "other-group")!.baseStock).toBe(999);
  });

  it.each(["other-group", null])("rejects a variant when its planned group %s has changed", async (matchedStockGroupId) => {
    const database = setup();
    database.planned[0].rowData.category = "ATK";
    database.planned[0].commitAction = "create-variant";
    database.planned[0].rowData.autoAction = "auto_create_variant";
    database.planned[0].rowData.matchedStockGroupId = matchedStockGroupId;
    const before = structuredClone({ products: database.products, groups: database.groups, batches: database.batches, planned: database.planned });
    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toThrow(/Relasi stok berubah/i);
    expect({ products: database.products, groups: database.groups, batches: database.batches, planned: database.planned }).toEqual(before);
    expect(database.items).toEqual([]);
  });

  it.each(["group-1", undefined])("allows a valid or older variant plan with group %s", async (matchedStockGroupId) => {
    const database = setup();
    const row = database.planned[0].rowData;
    row.category = "ATK";
    database.planned[0].commitAction = "create-variant";
    row.autoAction = "auto_create_variant";
    row.matchedStockGroupId = matchedStockGroupId;
    row.sku = "HVS-NEW";
    row.unit = "lembar";
    row.price = 50000;
    row.costPrice = null;
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(database.products.find(p => p.sku === "HVS-NEW")?.stockGroupId).toBe("group-1");
    expect(database.groups).toHaveLength(1);
  });

  it("rejects a variant whose matched group changed category after planning", async () => {
    const database = setup();
    database.planned[0].commitAction = "create-variant";
    database.planned[0].rowData.autoAction = "auto_create_variant";
    database.planned[0].rowData.costPrice = null;
    const before = structuredClone({ products: database.products, groups: database.groups, batches: database.batches, planned: database.planned });

    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toThrow(/kategori.*berbeda.*grup stok/i);
    expect({ products: database.products, groups: database.groups, batches: database.batches, planned: database.planned }).toEqual(before);
    expect(database.items).toEqual([]);
  });
});
