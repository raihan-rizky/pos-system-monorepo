import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@pos/db";
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";
import { applyGroupPricingChange, previewGroupPricingChange } from "@/features/product-stock-groups/group-pricing-service";

vi.mock("@pos/db", () => ({ db: {}, Prisma: {} }));

const actor = { id: "owner", name: "Owner" };
const snapshot = {
  version: 1 as const, productId: "box", unit: "box", unitMultiplierToBase: 12,
  orderedUnitMultiplierToBase: 12, costPrice: 36_000, price: 40_000, hargaAgen: 38_000, hargaDinas: 37_000,
};

function fixture() {
  const state = {
    groups: [{ id: "group", storeId: "store", baseUnit: "pcs", pricingConfig: null as unknown }],
    products: [
      { id: "pcs", storeId: "store", stockGroupId: "group" as string | null, unit: "pcs", price: "3000", costPrice: "2000", hargaAgen: null as number | null, hargaDinas: null as number | null, unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false },
      { id: "box", storeId: "store", stockGroupId: "group" as string | null, unit: "box", price: "32400", costPrice: "24000", hargaAgen: null as number | null, hargaDinas: null as number | null, unitMultiplierToBase: 12, isActive: true, conversionNeedsReview: false },
    ],
    logs: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async (_strings: TemplateStringsArray, id: string) => [{ id }],
    productStockGroup: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => {
        const group = state.groups.find((candidate) => candidate.id === where.id && candidate.storeId === where.storeId);
        return group ? { ...structuredClone(group), products: structuredClone(state.products.filter((product) => product.stockGroupId === group.id)) } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(state.groups.find((group) => group.id === where.id)!, data),
    },
    product: {
      findFirst: async ({ where }: { where: { id: string; storeId: string; isActive: boolean } }) => {
        const product = state.products.find((candidate) => candidate.id === where.id && candidate.storeId === where.storeId && candidate.isActive === where.isActive);
        return product ? structuredClone(product) : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: object }) => structuredClone(Object.assign(state.products.find((product) => product.id === where.id)!, data)),
    },
    productPriceLog: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { state.logs.push(...data); } },
    productStockGroupActivity: { create: async ({ data }: { data: Record<string, unknown> }) => { state.activities.push(data); } },
  } as unknown as Prisma.TransactionClient;
  const transaction = async (callback: () => Promise<unknown>) => {
    const before = structuredClone(state);
    try { await callback(); } catch (error) { Object.assign(state, before); throw error; }
  };
  const apply = (pricing = snapshot, productId = "box", stockGroupId: string | null = "group") =>
    new InventoryInboundReceiptRepository().applyInboundPricing(tx, {
      storeId: "store", receiptId: "receipt", actor, lines: [{ productId, stockGroupId, pricing }],
    });
  return { state, tx, transaction, apply };
}

async function enableAuto(context: ReturnType<typeof fixture>) {
  const changes = { members: [{ productId: "box", mode: "AUTO" as const }] };
  const preview = await previewGroupPricingChange(context.tx, { storeId: "store", groupId: "group", changes });
  await applyGroupPricingChange(context.tx, { storeId: "store", groupId: "group", changes, expectedVersion: preview.version, expectedProjection: preview.projectionToken, actor });
  context.state.logs.length = 0;
  context.state.activities.length = 0;
}

async function enableManual(context: ReturnType<typeof fixture>) {
  const changes = { members: [{ productId: "box", mode: "MANUAL" as const }] };
  const preview = await previewGroupPricingChange(context.tx, { storeId: "store", groupId: "group", changes });
  await applyGroupPricingChange(context.tx, { storeId: "store", groupId: "group", changes, expectedVersion: preview.version, expectedProjection: preview.projectionToken, actor });
  context.state.logs.length = 0;
  context.state.activities.length = 0;
}

describe("receipt pricing repository", () => {
  it("keeps current group prices and reports a warning when the saved rule revision is stale", async () => {
    const context = fixture();
    await enableManual(context);
    const revision = (context.state.groups[0].pricingConfig as { revision: number }).revision;
    const before = structuredClone(context.state);
    const pricing = {
      version: 2 as const,
      orderedUnitMultiplierToBase: 1,
      units: [
        { productId: "pcs", unit: "pcs", unitMultiplierToBase: 1, costPrice: 3_000, price: 3_500,
          hargaAgen: null, hargaDinas: null, priceEdited: true,
          original: { costPrice: 2_000, price: 3_000, hargaAgen: null, hargaDinas: null },
          pricingMode: "AUTO" as const, pricingSourceProductId: "pcs", pricingConfigRevision: revision - 1 },
        { productId: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 36_000, price: 40_000,
          hargaAgen: null, hargaDinas: null, priceEdited: true,
          original: { costPrice: 24_000, price: 32_400, hargaAgen: null, hargaDinas: null },
          pricingMode: "MANUAL" as const, pricingSourceProductId: "pcs", pricingConfigRevision: revision - 1 },
      ],
    };

    const result = await new InventoryInboundReceiptRepository().applyInboundPricing(context.tx, {
      storeId: "store", receiptId: "receipt", actor,
      lines: [{ productId: "pcs", stockGroupId: "group", pricing }],
    });

    expect(result).toEqual({ skippedProductIds: ["pcs"] });
    expect(context.state).toEqual(before);
  });

  it("preserves changed group prices while applying pricing for an unrelated product", async () => {
    const context = fixture();
    await enableManual(context);
    const revision = (context.state.groups[0].pricingConfig as { revision: number }).revision;
    context.state.products.push({
      id: "single", storeId: "store", stockGroupId: null, unit: "pcs", price: "500",
      costPrice: "300", hargaAgen: null, hargaDinas: null, unitMultiplierToBase: 1,
      isActive: true, conversionNeedsReview: false,
    });
    const pricing = {
      version: 2 as const, orderedUnitMultiplierToBase: 1,
      units: [
        { productId: "pcs", unit: "pcs", unitMultiplierToBase: 1, costPrice: 3_000, price: 3_500,
          hargaAgen: null, hargaDinas: null, priceEdited: true,
          original: { costPrice: 2_000, price: 2_900, hargaAgen: null, hargaDinas: null },
          pricingMode: "AUTO" as const, pricingSourceProductId: "pcs", pricingConfigRevision: revision },
        { productId: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 36_000, price: 40_000,
          hargaAgen: null, hargaDinas: null, priceEdited: true,
          original: { costPrice: 24_000, price: 32_400, hargaAgen: null, hargaDinas: null },
          pricingMode: "MANUAL" as const, pricingSourceProductId: "pcs", pricingConfigRevision: revision },
      ],
    };
    const singlePricing = {
      version: 1 as const, productId: "single", unit: "pcs", unitMultiplierToBase: 1,
      orderedUnitMultiplierToBase: 1, costPrice: 350, price: 600, hargaAgen: 550, hargaDinas: 525,
    };

    const result = await new InventoryInboundReceiptRepository().applyInboundPricing(context.tx, {
      storeId: "store", receiptId: "receipt", actor,
      lines: [
        { productId: "pcs", stockGroupId: "group", pricing },
        { productId: "single", stockGroupId: null, pricing: singlePricing },
      ],
    });

    expect(result).toEqual({ skippedProductIds: ["pcs"] });
    expect(context.state.products[0]).toMatchObject({ costPrice: "2000.00", price: "3000.00" });
    expect(context.state.products[1]).toMatchObject({ costPrice: "24000.00", price: "32400.00" });
    expect(context.state.products[2]).toMatchObject({ costPrice: 350, price: 600, hargaAgen: 550, hargaDinas: 525 });
  });

  it("retains every receipt line in a group when only one line has a stale price", async () => {
    const context = fixture();
    await enableManual(context);
    const revision = (context.state.groups[0].pricingConfig as { revision: number }).revision;
    const before = structuredClone(context.state);
    const units = [
      { productId: "pcs", unit: "pcs", unitMultiplierToBase: 1, costPrice: 3_000, price: 3_500,
        hargaAgen: null, hargaDinas: null, priceEdited: true,
        original: { costPrice: 2_000, price: 3_000, hargaAgen: null, hargaDinas: null },
        pricingMode: "AUTO" as const, pricingSourceProductId: "pcs", pricingConfigRevision: revision },
      { productId: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 36_000, price: 40_000,
        hargaAgen: null, hargaDinas: null, priceEdited: true,
        original: { costPrice: 24_000, price: 32_400, hargaAgen: null, hargaDinas: null },
        pricingMode: "MANUAL" as const, pricingSourceProductId: "pcs", pricingConfigRevision: revision },
    ];
    const result = await new InventoryInboundReceiptRepository().applyInboundPricing(context.tx, {
      storeId: "store", receiptId: "receipt", actor,
      lines: [
        { productId: "pcs", stockGroupId: "group", pricing: { version: 2, orderedUnitMultiplierToBase: 1, units } },
        { productId: "box", stockGroupId: "group", pricing: { version: 2, orderedUnitMultiplierToBase: 12,
          units: [units[0], { ...units[1], original: { ...units[1].original, price: 30_000 } }] } },
      ],
    });

    expect(result).toEqual({ skippedProductIds: ["pcs", "box"] });
    expect(context.state).toEqual(before);
  });

  it("retains a standalone product's current prices when its saved baseline is stale", async () => {
    const context = fixture();
    context.state.products[1].stockGroupId = null;
    const before = structuredClone(context.state);
    const result = await new InventoryInboundReceiptRepository().applyInboundPricing(context.tx, {
      storeId: "store", receiptId: "receipt", actor,
      lines: [{ productId: "box", stockGroupId: null, pricing: { version: 2, orderedUnitMultiplierToBase: 12, units: [{
        productId: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 36_000, price: 40_000,
        hargaAgen: null, hargaDinas: null, priceEdited: true,
        original: { costPrice: 24_000, price: 30_000, hargaAgen: null, hargaDinas: null },
        pricingMode: "MANUAL", pricingSourceProductId: null, pricingConfigRevision: null,
      }] } }],
    });

    expect(result).toEqual({ skippedProductIds: ["box"] });
    expect(context.state).toEqual(before);
  });

  it("updates a standalone unit and records all four price changes", async () => {
    const context = fixture();
    context.state.products[1].stockGroupId = null;
    await context.transaction(() => context.apply(snapshot, "box", null));
    expect(context.state.products[1]).toMatchObject({ costPrice: 36_000, price: 40_000, hargaAgen: 38_000, hargaDinas: 37_000 });
    expect(context.state.logs.map((log) => log.field)).toEqual(expect.arrayContaining(["COST_PRICE", "PRICE", "HARGA_AGEN", "HARGA_DINAS"]));
    expect(context.state.logs.every((log) => log.source === "SYSTEM" && log.note === "Penerimaan barang receipt")).toBe(true);
  });

  it("keeps a manual follower's HPP independent of its source", async () => {
    const context = fixture();
    await enableManual(context);
    await context.transaction(() => context.apply());
    expect(context.state.products[0].costPrice).toBe("2000.00");
    expect(context.state.products[1]).toMatchObject({ costPrice: "36000.00", price: "40000.00", hargaAgen: 38_000, hargaDinas: 37_000 });
  });

  it("converts an automatic follower's HPP to the source and preserves automatic mode", async () => {
    const context = fixture();
    await enableAuto(context);
    await context.transaction(() => context.apply());
    expect(context.state.products[0].costPrice).toBe("3000.00");
    expect(context.state.products[1]).toMatchObject({ costPrice: "36000.00", price: "40000.00", hargaAgen: 38_000, hargaDinas: 37_000 });
    expect(context.state.groups[0].pricingConfig).toMatchObject({ members: { box: { mode: "AUTO" } } });
    expect(context.state.logs.map((log) => log.field)).toEqual(expect.arrayContaining(["COST_PRICE", "PRICE", "HARGA_AGEN", "HARGA_DINAS"]));
    expect(context.state.activities).toHaveLength(1);
  });

  it("treats a follower missing from a legacy pricing config as manual", async () => {
    const context = fixture();
    await enableAuto(context);
    const config = context.state.groups[0].pricingConfig as { members: Record<string, unknown> };
    delete config.members.box;
    await context.transaction(() => context.apply());
    expect(context.state.products[0].costPrice).toBe("2000.00");
    expect(context.state.products[1].costPrice).toBe("36000.00");
    expect(context.state.groups[0].pricingConfig).toMatchObject({ members: { box: { mode: "MANUAL" } } });
  });

  it("rejects a stale unit conversion without changing prices", async () => {
    const context = fixture();
    context.state.products[1].unitMultiplierToBase = 6;
    const before = structuredClone(context.state);
    await expect(context.transaction(() => context.apply())).rejects.toThrow(/konversi produk berubah/i);
    expect(context.state).toEqual(before);
  });

  it("rolls back a group projection that cannot represent the selected HPP exactly", async () => {
    const context = fixture();
    await enableAuto(context);
    const before = structuredClone(context.state);
    await expect(context.transaction(() => context.apply({ ...snapshot, costPrice: 100.01 }))).rejects.toThrow(/tidak dapat diwakili tepat/);
    expect(context.state).toEqual(before);
  });
});
