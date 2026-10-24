import { describe, expect, it, vi } from "vitest";
const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));
import { importPricingDatabase, reorderPersistedKeys } from "./import-pricing-database";
import { commitProductImportChunk } from "../product-import-commit-service";
import { undoImportPricing } from "../import-pricing-undo";
import { groupPricingVersion, readGroupPricingInput } from "@/features/product-stock-groups/group-pricing-service";
const actor = { id: "user", storeId: "store-main" };

describe("import automatic pricing undo", () => {
  it.each(["groups", "products"])("restores unchanged data after JSONB reordered persisted %s keys", async section => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    const undo = d.batches[0].summary.pricingUndo;
    undo[section] = reorderPersistedKeys(undo[section]);
    await d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }));
    expect(d.batches[0].status).toBe("UNDONE");
    expect(Number(d.products.find(p => p.id === "rim").price)).toBe(50000);
    expect(Number(d.products.find(p => p.id === "dus").costPrice)).toBe(150000);
  });
  it("undoes new-group stock and retains the deactivated source identity with review", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    d.planned[0].commitAction = "create";
    d.planned[0].rowData = { ...d.planned[0].rowData, matchedProductId: undefined, name: "NEW", sku: "NEW" };
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    const product = d.products.find(p => p.sku === "NEW");
    const group = d.groups.find(g => g.id === product.stockGroupId);
    await d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }));
    expect(group.baseStock).toBe(0);
    expect(group.pricingConfig.sourceProductId).toBe(product.id);
    expect(product.isActive).toBe(false);
  });
  it("reverses full-update displayed stock adjustments without duplicating cascaded inventory", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000, "update"); d.planned[0].rowData.stock = 30;
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    expect(d.groups[0].baseStock).toBe(30);
    const result = await d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }));
    expect(d.groups[0].baseStock).toBe(20);
    expect(result.reversalInventoryLogCount).toBe(1);
    expect(d.inventory.at(-1)).toMatchObject({ productId: "rim", type: "OUT", quantity: 10 });
  });
  it("restores cascade money and legacy ratios with a new revision/token", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    const oldVersion = groupPricingVersion(await readGroupPricingInput(d.tx, { storeId: actor.storeId, groupId: "group-1" }));
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    const revision = d.groups[0].pricingConfig.revision;
    await d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }));
    expect(Number(d.products.find(p => p.id === "dus")?.price)).toBe(225000);
    expect(Number(d.products.find(p => p.id === "dus")?.costPrice)).toBe(150000);
    expect(Number(d.products.find(p => p.id === "rim")?.price)).toBe(50000);
    expect(d.groups[0].pricingConfig.members.dus.factor).toEqual({ numerator: "9", denominator: "10" });
    expect(d.groups[0].pricingConfig.revision).toBeGreaterThan(revision);
    expect(groupPricingVersion(await readGroupPricingInput(d.tx, { storeId: actor.storeId, groupId: "group-1" }))).not.toBe(oldVersion);
    expect(d.batches[0].status).toBe("UNDONE");
  });
  it("refuses a config-only edit even when product money still matches", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    d.batches[0].summary = reorderPersistedKeys(d.batches[0].summary);
    d.groups[0].pricingConfig.members.dus.mode = "MANUAL";
    await expect(d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }))).rejects.toThrow(/berubah/);
    expect(Number(d.products.find(p => p.id === "rim")?.price)).toBe(60000);
  });
  it("refuses a later edit to a cascaded member", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    d.batches[0].summary = reorderPersistedKeys(d.batches[0].summary);
    d.products.find(p => p.id === "dus")!.hargaAgen = 1;
    await expect(d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }))).rejects.toThrow(/berubah/);
  });
  it("still rejects changed member-array order in a reordered persisted snapshot", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("rim", 2, 0, 60000, 45000);
    await commitProductImportChunk({ batchOperationId: "batch", cursor: 0, chunkSize: 1 }, actor);
    d.batches[0].summary = reorderPersistedKeys(d.batches[0].summary);
    d.batches[0].summary.pricingUndo.groups["group-1"].after.members.reverse();
    await expect(d.transaction(tx => undoImportPricing(tx, { batch: d.batches[0], actor, storeId: actor.storeId }))).rejects.toThrow(/berubah/);
    expect(d.batches[0].status).toBe("PENDING");
  });
});
