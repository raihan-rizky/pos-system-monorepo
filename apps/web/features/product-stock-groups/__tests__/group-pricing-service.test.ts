import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@pos/db";
import { initializeGroupPricing } from "../automatic-pricing";
import {
  prepareGroupPricingMutation, synchronizeGroupPricingMutation,
  previewGroupPricingChange, applyGroupPricingChange, initializeGroupPricingInTransaction,
} from "../group-pricing-service";

function fixture() {
  const state = { groups: [{ id: "g", storeId: "s", baseUnit: "pcs", pricingConfig: null as unknown }], products: [
    { id: "a", storeId: "s", stockGroupId: "g", unit: "pcs", price: "3000", costPrice: "2000" as string | null, unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false },
    { id: "b", storeId: "s", stockGroupId: "g", unit: "pak", price: "32400", costPrice: "10000" as string | null, unitMultiplierToBase: 12, isActive: true, conversionNeedsReview: false },
  ], logs: [] as unknown[], activities: [] as unknown[], locks: [] as string[] };
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: string[]) => {
      state.locks.push(`${strings.join("").includes("pos_product_stock_groups") ? "group" : "product"}:${values[0]}`);
      return [{ id: values[0] }];
    },
    productStockGroup: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => {
        const g = state.groups.find(g => g.id === where.id && g.storeId === where.storeId);
        return g ? { ...structuredClone(g), products: structuredClone(state.products.filter(p => p.stockGroupId === g.id)) } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(state.groups.find(g => g.id === where.id)!, data),
    },
    product: {
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(state.products.find(p => p.id === where.id)!, data),
    },
    productPriceLog: { createMany: async ({ data }: { data: unknown[] }) => { state.logs.push(...data); } },
    productStockGroupActivity: { create: async ({ data }: { data: unknown }) => { state.activities.push(data); } },
  } as unknown as Prisma.TransactionClient;
  const transaction = async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
    const before = structuredClone(state);
    try { return await fn(tx); } catch (error) { Object.assign(state, before); throw error; }
  };
  return { state, tx, transaction };
}
const actor = { id: "u", name: "Admin" };
const intent = { productId: "a", price: "3500", costPrice: "2100" };

async function enableFollowerAuto({ tx, state }: ReturnType<typeof fixture>) {
  const changes = { members: [{ productId: "b", mode: "AUTO" as const }] };
  const preview = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes });
  await applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: preview.version, expectedProjection: preview.projectionToken, actor });
  state.logs.length = 0;
  state.activities.length = 0;
  state.locks.length = 0;
}

describe("transactional group pricing", () => {
  it("keeps inactive member intents unavailable to ordinary group pricing previews", async () => {
    const { tx, state } = fixture();
    state.products[1].isActive = false;
    await expect(previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: {
      members: [{ productId: "b", mode: "MANUAL", costPrice: "19000" }],
    } })).rejects.toMatchObject({ status: 422 });
    expect(state.products[1].costPrice).toBe("10000");
  });
  it("initializes the legacy preimage as Manual before source writes", async () => {
    const { tx, state } = fixture();
    const prepared = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
    await tx.product.update({ where: { id: "a" }, data: { price: "3500", costPrice: "2100" } });
    const result = await synchronizeGroupPricingMutation(tx, { prepared, actor });
    expect(result[0].members.find(p => p.productId === "b")).toMatchObject({ price: "32400.00", costPrice: "10000.00" });
    expect(result[0].config.members.b).toMatchObject({ mode: "MANUAL", factor: null });
    expect(state.locks).toEqual(["group:g", "product:a", "product:b"]);
    expect(state.products.some(p => "stock" in p)).toBe(false);
    expect(state.logs).toHaveLength(2);
    expect(state.activities).toHaveLength(1);
  });

  it("previews without writes and rejects a stale preview even if a direct source writer did not bump revision", async () => {
    const { tx, state } = fixture();
    const preview = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { members: [intent] } });
    expect(state.logs).toEqual([]); expect(state.groups[0].pricingConfig).toBeNull(); expect(state.locks).toEqual([]);
    state.products[0].price = "3100";
    await expect(applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { members: [intent] }, expectedVersion: preview.version, expectedProjection: preview.projectionToken, actor })).rejects.toMatchObject({ status: 409 });
    expect(state.logs).toEqual([]);
  });

  it("applies exactly the server projection and rejects projection tampering", async () => {
    const { tx } = fixture();
    const changes = { members: [intent] };
    const preview = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes });
    await expect(applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: preview.version, expectedProjection: "tampered", actor })).rejects.toMatchObject({ status: 409 });
    const result = await applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: preview.version, expectedProjection: preview.projectionToken, actor });
    expect(result).toEqual(preview.after);
  });
  it("reports stale membership as a conflict before validating old member intents", async () => {
    const { tx, state } = fixture();
    const changes = { members: [{ productId: "b", price: "32000" }] };
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes });
    state.products.splice(1, 1);
    await expect(applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: p.version, expectedProjection: p.projectionToken, actor })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects explicit AUTO follower HPP, allows Manual, and returns to Auto preserving selling price", async () => {
    const context = fixture();
    await enableFollowerAuto(context);
    const { tx } = context;
    await expect(previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { members: [{ productId: "b", costPrice: "5" }] } })).rejects.toMatchObject({ status: 422 });
    const manual = { members: [{ productId: "b", mode: "MANUAL" as const, price: "30000", costPrice: "7" }] };
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: manual });
    await applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: manual, expectedVersion: p.version, expectedProjection: p.projectionToken, actor });
    const automatic = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { members: [{ productId: "b", mode: "AUTO" }] } });
    expect(automatic.after.members[1]).toMatchObject({ price: "30000.00", costPrice: "24000.00" });
    expect(automatic.after.config.members.b.factor).toEqual({ numerator: "5", denominator: "6" });
  });

  it("keeps HPP independent when source HPP is null", async () => {
    const context = fixture();
    context.state.products[0].costPrice = null;
    await enableFollowerAuto(context);
    const { tx } = context;
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { members: [{ productId: "a", price: "3500" }] } });
    expect(p.after.members[1]).toMatchObject({ price: "37800.00", costPrice: "10000.00", review: { costPrice: ["SOURCE_COST_UNKNOWN"] } });
  });

  it("retains a valid factor at source zero and holds money when the legacy factor is missing", async () => {
    const ready = fixture(); await enableFollowerAuto(ready);
    const zero = await previewGroupPricingChange(ready.tx, { storeId: "s", groupId: "g", changes: { members: [{ productId: "a", price: "0" }] } });
    expect(zero.after.members[1].price).toBe("0.00"); expect(zero.after.config.members.b.factor).toEqual({ numerator: "9", denominator: "10" });
    const legacy = fixture(); legacy.state.products[0].price = "0"; await enableFollowerAuto(legacy);
    const missing = await previewGroupPricingChange(legacy.tx, { storeId: "s", groupId: "g", changes: {} });
    expect(missing.after.members[1]).toMatchObject({ price: "32400.00", review: { price: ["SOURCE_PRICE_ZERO"] } });
    expect(missing.after.config.members.b.factor).toBeNull();
  });

  it("validates store and source membership/activity/conversion and preserves prices on source replacement", async () => {
    const { tx, state } = fixture();
    await expect(prepareGroupPricingMutation(tx, { storeId: "other", groupIds: ["g"] })).rejects.toMatchObject({ status: 404 });
    for (const sourceProductId of ["foreign", "inactive", "review"]) {
      state.products[1].id = sourceProductId; state.products[1].isActive = sourceProductId !== "inactive"; state.products[1].conversionNeedsReview = sourceProductId === "review";
      await expect(previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { sourceProductId: sourceProductId === "foreign" ? "missing" : sourceProductId } })).rejects.toMatchObject({ status: 422 });
    }
    state.products[1].id = "b"; state.products[1].isActive = true; state.products[1].conversionNeedsReview = false;
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { sourceProductId: "b" } });
    expect(p.after.members.map(m => m.price)).toEqual(["3000.00", "32400.00"]);
    expect(p.after.config.sourceProductId).toBe("b");
    expect(p.after.config.members.a.factor).toEqual({ numerator: "10", denominator: "9" });
  });

  it("projects Auto conversions, keeps new members Manual and marks a missing source for review", async () => {
    const context = fixture();
    await enableFollowerAuto(context);
    const { tx, state } = context;
    const prepared = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
    state.products[1].unitMultiplierToBase = 24;
    state.products.push({ ...state.products[1], id: "c", unit: "dus", unitMultiplierToBase: 120 });
    const [result] = await synchronizeGroupPricingMutation(tx, { prepared, actor });
    expect(result.members[1]).toMatchObject({ price: "64800.00", costPrice: "48000.00" });
    expect(result.members[2]).toMatchObject({ price: "32400.00", costPrice: "24000.00" });
    expect(result.config.members.c).toMatchObject({ mode: "MANUAL", factor: null });
    const beforeDelete = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
    state.products.splice(0, 1);
    const [missing] = await synchronizeGroupPricingMutation(tx, { prepared: beforeDelete, actor });
    expect(missing.members[0].review.price).toEqual(["SOURCE_UNAVAILABLE"]);
  });

  it("rolls back config, money and price logs when activity persistence fails", async () => {
    const { tx, state, transaction } = fixture(); const before = structuredClone(state);
    vi.spyOn(tx.productStockGroupActivity, "create").mockRejectedValue(new Error("audit unavailable"));
    await expect(transaction(async tx => {
      const prepared = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
      await tx.product.update({ where: { id: "a" }, data: { price: "3500" } });
      await synchronizeGroupPricingMutation(tx, { prepared, actor });
    })).rejects.toThrow("audit unavailable");
    expect(state).toEqual(before);
  });

  it("initialization is idempotent and preserves old HPP", async () => {
    const { tx, state } = fixture();
    const first = await initializeGroupPricingInTransaction(tx, { storeId: "s", groupId: "g" });
    expect(first.initialized).toBe(true); expect(state.logs).toHaveLength(0);
    const again = await initializeGroupPricingInTransaction(tx, { storeId: "s", groupId: "g" });
    expect(again.initialized).toBe(false); expect(state.logs).toHaveLength(0);
    expect(initializeGroupPricing).toBeTypeOf("function");
  });
  it("locks every affected group first and inactive members in a single sorted product set", async () => {
    const { tx, state } = fixture();
    state.groups.push({ ...state.groups[0], id: "z" });
    state.products.push({ ...state.products[0], id: "c", stockGroupId: "z" });
    state.products[1].isActive = false;
    await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["z", "g", "z"] });
    expect(state.locks).toEqual(["group:g", "group:z", "product:a", "product:b", "product:c"]);
  });
  it("anchors the first projection to rounded source money and remains stable after apply and no-op synchronization", async () => {
    const context = fixture();
    const { tx, state } = context;
    state.products[0].price = "3.00"; state.products[0].costPrice = "2.00";
    state.products[1].price = "30.00"; state.products[1].costPrice = "20.00";
    state.products[1].unitMultiplierToBase = 10;
    await enableFollowerAuto(context);
    const changes = { members: [{ productId: "a", price: "3.005", costPrice: "2.005" }] };
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes });
    expect(p.after.members[0]).toMatchObject({ price: "3.01", costPrice: "2.01" });
    expect(p.after.members[1]).toMatchObject({ price: "30.10", costPrice: "20.10" });
    const applied = await applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: p.version, expectedProjection: p.projectionToken, actor });
    expect(applied).toEqual(p.after);
    expect(state.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: "a", field: "PRICE", newValue: "3.01" }),
      expect.objectContaining({ productId: "a", field: "COST_PRICE", newValue: "2.01" }),
      expect.objectContaining({ productId: "b", field: "PRICE", newValue: "30.10" }),
      expect.objectContaining({ productId: "b", field: "COST_PRICE", newValue: "20.10" }),
    ]));
    const logCount = state.logs.length;
    const prepared = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
    const [stable] = await synchronizeGroupPricingMutation(tx, { prepared, actor });
    expect(stable.members).toEqual(applied.members); expect(state.logs).toHaveLength(logCount);
  });
  it("derives an AUTO follower factor from rounded effective money", async () => {
    const context = fixture();
    const { tx, state } = context;
    state.products[0].price = "3.00"; state.products[1].price = "30.00"; state.products[1].unitMultiplierToBase = 10;
    await enableFollowerAuto(context);
    const changes = { members: [{ productId: "b", price: "30.005" }] };
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes });
    expect(p.after.members[1].price).toBe("30.01");
    expect(p.after.config.members.b.factor).toEqual({ numerator: "3001", denominator: "3000" });
    const applied = await applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: p.version, expectedProjection: p.projectionToken, actor });
    const prepared = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
    expect((await synchronizeGroupPricingMutation(tx, { prepared, actor }))[0].members).toEqual(applied.members);
  });
  it("rounds explicit Manual money half up and preserves explicit null HPP", async () => {
    const { tx } = fixture();
    const changes = { members: [{ productId: "b", mode: "MANUAL" as const, price: "1.005", costPrice: "2.005" }] };
    const p = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes });
    expect(p.after.members[1]).toMatchObject({ price: "1.01", costPrice: "2.01" });
    const applied = await applyGroupPricingChange(tx, { storeId: "s", groupId: "g", changes, expectedVersion: p.version, expectedProjection: p.projectionToken, actor });
    const prepared = await prepareGroupPricingMutation(tx, { storeId: "s", groupIds: ["g"] });
    expect((await synchronizeGroupPricingMutation(tx, { prepared, actor }))[0].members).toEqual(applied.members);
    const cleared = await previewGroupPricingChange(tx, { storeId: "s", groupId: "g", changes: { members: [{ productId: "b", costPrice: null }] } });
    expect(cleared.after.members[1]).toMatchObject({ price: "1.01", costPrice: null });
  });
});
