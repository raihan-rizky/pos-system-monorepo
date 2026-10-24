import { describe, expect, it, vi } from "vitest";
const transact = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transact }, Prisma: {} }));
import { importPricingDatabase } from "./import-pricing-database";
import { previewImportGroupPricing } from "../import-pricing-preview";
import { resolveProductImportAutoDecisions } from "../../helpers/auto-decisions";
import { startProductImportCommit, commitProductImportChunk, productImportStartSchema } from "../product-import-commit-service";

describe("visible import pricing preview", () => {
  it("fills the existing price/HPP cells with the effective projection and row errors", async () => {
    const d = importPricingDatabase();
    d.addRow("dus", 2, 0, 270000, 123); d.addRow("rim", 3, 1, 60000, 45000);
    const rows = d.planned.map(p => ({ ...p.rowData, autoAction: "auto_price_update" as const }));
    const preview = await previewImportGroupPricing(d.tx, { rows, storeId: "store-main" });
    expect(preview[0].costPrice).toBe(123);
    expect(preview[0].pricingPreview?.costPrice).toBe(225000);
    expect(preview[0].errors.join(" ")).toMatch(/HPP.*225000.*Manual/);
    expect(preview[0].price).toBe(270000);
    expect(d.logs).toEqual([]); expect(d.groups[0].pricingConfig).toBeNull();
  });
  it("blank follower HPP previews the final source HPP without conflict", async () => {
    const d = importPricingDatabase();
    d.addRow("dus", 2, 0, 270000); d.addRow("rim", 3, 1, 60000, 45000);
    const rows = d.planned.map(p => ({ ...p.rowData, autoAction: "auto_price_update" as const }));
    const preview = await previewImportGroupPricing(d.tx, { rows, storeId: "store-main" });
    expect(preview[0].costPrice).toBeUndefined();
    expect(preview[0].pricingPreview?.costPrice).toBe(225000); expect(preview[0].errors).toEqual([]);
  });
  it("keeps an automatic legacy skip unchanged through drawer payload, start planning and commit", async () => {
    const d = importPricingDatabase(); transact.mockImplementation(d.transaction);
    d.addRow("dus", 2, 0, 225000, 150000);
    const raw = d.planned.map(p => p.rowData); d.planned.splice(0);
    const rows = resolveProductImportAutoDecisions({ rows: raw, existingProducts: d.products.map(p => ({ ...p, category: "ATK", price: Number(p.price), costPrice: Number(p.costPrice) })), existingSkus: new Set(d.products.map(p => p.sku)) });
    expect(rows[0].autoAction).toBe("auto_skip");
    const preview = await previewImportGroupPricing(d.tx, { rows, storeId: "store-main" });
    const before = structuredClone(d.products);
    const start = await startProductImportCommit(productImportStartSchema.parse({ rows: preview, decisions: {}, createMissingCategories: false }), { id: "user", storeId: "store-main" });
    expect(d.planned[0].commitAction).toBe("skip");
    await commitProductImportChunk({ batchOperationId: start.batchOperationId, cursor: 0, chunkSize: 1 }, { id: "user", storeId: "store-main" });
    expect(d.products).toEqual(before); expect(d.groups[0].pricingConfig).toBeNull();
    expect(d.logs).toEqual([]); expect(d.activities).toEqual([]);
  });
  it("recomputes from original nullable intent after the source is skipped", async () => {
    const d = importPricingDatabase();
    d.addRow("dus", 2, 0, 270000, null); d.addRow("rim", 3, 1, 60000, 45000);
    const rows = d.planned.map(p => ({ ...p.rowData, autoAction: "auto_price_update" as const }));
    const first = await previewImportGroupPricing(d.tx, { rows, storeId: "store-main" });
    const second = await previewImportGroupPricing(d.tx, { rows: first, decisions: { "3": "skip" }, storeId: "store-main" });
    expect(second[0].costPrice).toBeNull();
    expect(second[0].pricingPreview?.costPrice).toBe(200000);
    expect(second[0].errors).toEqual([]);
    d.planned.splice(0); transact.mockImplementation(d.transaction);
    const start = await startProductImportCommit(productImportStartSchema.parse({ rows: second, decisions: { "3": "skip" } }), { id: "user", storeId: "store-main" });
    await commitProductImportChunk({ batchOperationId: start.batchOperationId, cursor: 0, chunkSize: 2 }, { id: "user", storeId: "store-main" });
    expect(Number(d.products.find(p => p.id === "dus").costPrice)).toBe(200000);
  });
});
