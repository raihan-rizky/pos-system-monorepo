import { describe, expect, it, vi } from "vitest";
const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));
import { importPricingDatabase, reorderPersistedKeys } from "./import-pricing-database";
import { commitProductImportChunk } from "../product-import-commit-service";
const user = { id: "user", storeId: "store-main" };

describe("import pricing transactions", () => {
  it.each(["groups", "products"])("continues after JSONB reordered persisted %s snapshot keys", async section => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    const undo = d.batches[0].summary.pricingUndo;
    undo[section] = reorderPersistedKeys(undo[section]);
    d.addRow("dus", 3, 1, 280000, 225000);
    const result = await commitProductImportChunk({ batchOperationId: "batch", cursor: 1, chunkSize: 1 }, user);
    expect(result.cumulative.updatedProductCount).toBe(2);
    expect(Number(d.products.find(p => p.id === "dus").price)).toBe(280000);
    expect(d.batches[0].summary.pricingUndo.products.rim.before.price).toBe(50000);
  });
  it.each([false, true])("logs genuine preimages when moving to an existing group, changed money: %s", async changed => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    const cost = changed ? 45000 : 40000;
    d.groups.push({ ...d.groups[0], id: "group-2", groupKey: "moved|cat||", baseUnit: "lembar" });
    d.products.push({ ...d.products[0], id: "b-source", sku: "B-SOURCE", name: "MOVED", unit: "lembar", stockGroupId: "group-2", price: "30000", costPrice: String(cost) });
    d.products.push({ ...d.products[0], id: "b-follower", sku: "B-FOLLOWER", name: "MOVED", unit: "pack", stockGroupId: "group-2", unitMultiplierToBase: 2, price: "54000", costPrice: String(cost * 2) });
    d.addRow("rim", 2, 0, changed ? 60000 : 50000, cost, "update");
    d.planned[0].rowData.name = "MOVED";
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(d.products.find(p => p.id === "rim").stockGroupId).toBe("group-2");
    expect(d.groups[1].pricingConfig.sourceProductId).toBe("b-source");
    expect(d.groups[1].pricingConfig.members["b-follower"].factor).toEqual({ numerator: "9", denominator: "10" });
    const logs = d.logs.filter((l: any) => l.productId === "rim" && ["PRICE", "COST_PRICE"].includes(l.field));
    expect(logs).toEqual(changed ? [
      expect.objectContaining({ field: "PRICE", oldValue: "50000.00", newValue: "60000.00" }),
      expect.objectContaining({ field: "COST_PRICE", oldValue: "40000.00", newValue: "45000.00" }),
    ] : []);
    expect(d.batches[0].summary.priceLogCount).toBe(d.logs.length);
  });
  it("does not absorb an intervening group edit into an older batch undo snapshot", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    d.batches[0].summary = reorderPersistedKeys(d.batches[0].summary);
    d.groups[0].pricingConfig.members.dus.mode = "MANUAL";
    d.addRow("dus", 3, 1, 280000, 230000);
    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 1, chunkSize: 1 }, user)).rejects.toThrow(/berubah/);
    expect(d.batches[0].summary.updatedProductCount).toBe(1);
  });
  it("rolls back raw SQL, configuration, history and status when group audit fails", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    d.tx.productStockGroupActivity.create.mockRejectedValue(new Error("audit failed"));
    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toThrow("audit failed");
    expect(d.products.find(p => p.id === "rim").price).toBe("50000");
    expect(d.groups[0].pricingConfig).toBeNull(); expect(d.planned[0].status).toBe("PENDING");
    expect(d.logs).toEqual([]); expect(d.items).toEqual([]);
  });
  it("refuses a newly connected row discovered after locks instead of extending the lock union", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.groups.push({ ...d.groups[0], id: "group-2", groupKey: "other|cat||", baseUnit: "dus" });
    Object.assign(d.products[1], { name: "Other", stockGroupId: "group-2" });
    d.addRow("rim", 2, 0, 60000, 45000); d.addRow("dus", 3, 1, 270000, 225000);
    const query = d.tx.$queryRaw.getMockImplementation();
    d.tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join(" ").includes("pos_product_stock_groups") && sql.join(" ").includes("FOR UPDATE")) d.products[1].stockGroupId = "group-1";
      return query(sql, ...values);
    });
    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toThrow();
    expect(d.items).toEqual([]);
  });
  it("returns the earliest remaining cursor after an out-of-order independent group", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.groups.push({ ...d.groups[0], id: "group-2", groupKey: "other|cat||", baseUnit: "dus" });
    Object.assign(d.products[1], { name: "Other", stockGroupId: "group-2" });
    d.addRow("rim", 2, 0, 60000, 45000); d.addRow("dus", 3, 1, 270000, 225000);
    const result = await commitProductImportChunk({ batchOperationId: "batch", cursor: 1, chunkSize: 1 }, user);
    expect(result.nextCursor).toBe(0); expect(result.done).toBe(false);
    expect(result.cumulative.updatedProductCount).toBe(1);
  });
  it("a corrected retry commits prior failed peers exactly once", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000); d.addRow("dus", 3, 1, 270000, 1);
    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toMatchObject({ atomicGroups: [{ cursor: 0, rowNumbers: [2, 3] }] });
    d.planned[0].status = "FAILED"; d.planned[1].status = "FAILED";
    d.planned[1].rowData.costPrice = null;
    const result = await commitProductImportChunk({ batchOperationId: "batch", cursor: 1, chunkSize: 1 }, user);
    expect(result.committedSourceRowNumbers).toEqual([2, 3]);
    expect(result.cumulative.updatedProductCount).toBe(2);
  });
  it("refuses a missing or cross-store update target instead of marking it committed", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000); d.products[0].storeId = "other";
    await expect(commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user)).rejects.toThrow();
    expect(d.planned[0].status).toBe("PENDING");
  });
  it("moving a source preserves old follower money and audits the moved source against its true before", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000, "update");
    d.planned[0].rowData.name = "MOVED";
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(d.products.find(p => p.id === "dus")).toMatchObject({ price: "225000.00", costPrice: "150000.00" });
    expect(d.groups[0].pricingConfig.sourceProductId).toBe("rim");
    expect(d.groups[0].pricingConfig.members.dus.review.price).toContain("SOURCE_UNAVAILABLE");
    expect(d.logs.filter((l: any) => l.productId === "rim" && l.field === "PRICE")).toEqual([expect.objectContaining({ oldValue: "50000.00", newValue: "60000.00" })]);
  });
  it("includes inactive followers in sorted locks, cascades and undo snapshots", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.products.find(p => p.id === "dus")!.isActive = false;
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(d.locks).toContain("product:dus");
    expect(d.batches[0].summary.pricingUndo.products.dus.before.isActive).toBe(false);
  });
  it("skip rows remain idempotent with an explicit skip outcome and do not initialize their group", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000, "skip");
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    const retry = await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(d.items.find(i => i.sourceRowNumber === 2)?.action).toBe("SKIP");
    expect(retry.cumulative.skippedRowCount).toBe(1);
    expect(d.groups[0].pricingConfig).toBeNull();
  });
  it("mixed insert and price update derive new follower price against the final source", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    const rowData = { ...d.planned[0].rowData, rowNumber: 3, sku: "HVS-NEW", unit: "box", price: 540000, costPrice: 450000, unitMultiplierToBase: 10, autoAction: "auto_create_variant" };
    d.planned.push({ batchOperationId: "batch", cursorIndex: 1, sourceRowNumber: 3, status: "PENDING", commitAction: "create-variant", rowData });
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 1, chunkSize: 1 }, user);
    const created = d.products.find(p => p.sku === "HVS-NEW");
    expect(created).toMatchObject({ price: "540000.00", costPrice: "450000.00", stock: 2 });
    expect(d.groups[0].pricingConfig.members[created.id].factor).toEqual({ numerator: "9", denominator: "10" });
    expect(d.logs.filter((l: any) => l.productId === created.id && l.field === "PRICE")).toEqual([expect.objectContaining({ oldValue: null, newValue: "540000.00" })]);
  });
  it("a new group chooses its base source independently of reversed import rows", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("dus", 2, 0, 270000, 225000); d.addRow("rim", 3, 1, 60000, 45000);
    d.planned.forEach((p, index) => { p.commitAction = "create"; p.rowData = { ...p.rowData, name: "NEW", sku: `NEW-${index}`, matchedProductId: undefined, unitMultiplierToBase: index === 0 ? 5 : 1 }; });
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    const createdSource = d.products.find(p => p.sku === "NEW-1");
    const group = d.groups.find(g => g.id === createdSource.stockGroupId);
    expect(group.baseUnit).toBe("rim");
    expect(group.pricingConfig.sourceProductId).toBe(createdSource.id);
    expect(d.products.find(p => p.sku === "NEW-0")).toMatchObject({ price: "270000.00", costPrice: "225000.00" });
  });
  it.each(["update-price", "update"])("%s locks and projects the full group across reversed chunk boundaries", async action => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("dus", 2, 0, 270000, 225000, action);
    d.addRow("rim", 3, 1, 60000, 45000, action);
    const result = await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, user);
    expect(d.products.find(p => p.id === "rim")).toMatchObject({ price: "60000.00", costPrice: "45000.00" });
    expect(d.products.find(p => p.id === "dus")).toMatchObject({ price: "270000.00", costPrice: "225000.00" });
    expect(d.groups[0].pricingConfig.members.dus.factor).toEqual({ numerator: "9", denominator: "10" });
    expect(result.cumulative.updatedProductCount).toBe(2);
    expect(d.planned.every(r => r.status === "COMMITTED")).toBe(true);
    expect(d.locks.slice(0, 4)).toEqual(["batch:batch", "group:group-1", "product:dus", "product:rim"]);
    const retry = await commitProductImportChunk({ batchOperationId: "batch", cursor: 1, chunkSize: 1 }, user);
    expect(retry.chunk.updatedProductCount).toBe(0);
    expect(retry.cumulative.updatedProductCount).toBe(2);
    expect(d.logs.filter((l: any) => l.productId === "dus" && l.field === "PRICE")).toHaveLength(1);
  });

  it("a follower HPP conflict aborts source and single-row fallback alike", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000); d.addRow("dus", 3, 1, 270000, 99);
    for (const cursor of [0, 1]) await expect(commitProductImportChunk({ batchOperationId: "batch", cursor, chunkSize: 1 }, user)).rejects.toThrow(/HPP/);
    expect(d.products.find(p => p.id === "rim")?.price).toBe("50000");
    expect(d.groups[0].pricingConfig).toBeNull(); expect(d.logs).toEqual([]); expect(d.items).toEqual([]);
  });

  it("records effective cascade snapshots and serializes overlapping out-of-order requests", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000); d.addRow("dus", 3, 1, 270000);
    await Promise.all([1, 0].map(cursor => commitProductImportChunk({ batchOperationId: "batch", cursor, chunkSize: 1 }, user)));
    expect(d.batches[0].summary.updatedProductCount).toBe(2);
    expect(d.items.find(i => i.productId === "dus").afterSnapshot.costPrice).toBe(225000);
    expect(d.batches[0].summary.pricingUndo.groups["group-1"].before.config).toBeNull();
    expect(d.batches[0].summary.pricingUndo.groups["group-1"].after.config.members.dus.factor).toEqual({ numerator: "9", denominator: "10" });
  });
});
