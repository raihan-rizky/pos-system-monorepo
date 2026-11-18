import { describe, expect, it } from "vitest";
import { editInboundReceiptItem } from "../inbound-receipt-service";
import type { InventoryInboundReceiptRepository } from "../../types/inventory-management";

const updatedAt = new Date("2026-11-16T09:49:32.494Z");

function fixture(currentPrice = 9_000) {
  const unit = {
    productId: "pen",
    unit: "Bh",
    unitMultiplierToBase: 1,
    costPrice: 6_666,
    price: currentPrice,
    hargaAgen: 0,
    hargaDinas: 10_000,
    isActive: true,
    conversionNeedsReview: false,
    pricingMode: "AUTO" as const,
    pricingSourceProductId: "pen",
    pricingConfigRevision: 6,
  };
  const line = {
    id: "line-1",
    productId: "pen",
    stockGroupId: "group",
    updatedAt,
    reviewStatus: "APPROVED",
    expectedQuantity: 120,
    receivedQuantity: 120,
    matchStatus: "MATCHED",
    note: null,
    costPriceSnapshot: 6_875,
    supplierCostPrice: 6_875,
    unitMultiplierToBase: 1,
    pricingUnits: [unit],
    pricingSnapshot: {
      version: 2,
      orderedUnitMultiplierToBase: 1,
      units: [{
        productId: "pen",
        unit: "Bh",
        unitMultiplierToBase: 1,
        costPrice: 6_875,
        price: 9_500,
        hargaAgen: 0,
        hargaDinas: 10_500,
        priceEdited: true,
        original: { costPrice: 6_666, price: 9_000, hargaAgen: 0, hargaDinas: 10_000 },
        pricingMode: "AUTO",
        pricingSourceProductId: "pen",
        pricingConfigRevision: 3,
      }],
    },
    product: { id: "pen", name: "Pulpen", sku: "PULPEN-056", unit: "Bh" },
    goodsPurchaseItem: {
      id: "purchase-item",
      goodsPurchaseId: "purchase",
      productId: "pen",
      quantity: 120,
      latestUnitPrice: 6_875,
    },
    approvedReceivedExcludingCurrentReceipt: 0,
  };
  const receipt = { id: "receipt", storeId: "store", goodsPurchaseId: "purchase", lines: [line] };
  let writes = 0;
  const repository = {
    runInTransaction: async (callback: (tx: object) => Promise<unknown>) => callback({}),
    lockSubmittedReceipt: async () => receipt,
    updateReceiptLine: async (_tx: unknown, input: { itemId: string }) => {
      const target = receipt.lines.find((candidate) => candidate.id === input.itemId);
      if (!target) throw new Error("Unknown line");
      Object.assign(target, input);
      writes += 1;
    },
  } as unknown as InventoryInboundReceiptRepository;

  const edit = (baselinePrice: number | null = currentPrice) =>
    editInboundReceiptItem({
      repository,
      user: { id: "owner", role: "OWNER", storeId: "store" },
      receiptId: "receipt",
      itemId: "line-1",
      expectedUpdatedAt: updatedAt.toISOString(),
      input: {
        matchStatus: "MATCHED",
        receivedQuantity: 120,
        pricing: {
          version: 2,
          units: [{
            productId: "pen",
            costPrice: 6_875,
            price: 9_500,
            hargaAgen: 0,
            hargaDinas: 10_500,
            priceEdited: true,
            ...(baselinePrice === null ? {} : {
              baseline: {
                unit: "Bh",
                unitMultiplierToBase: 1,
                costPrice: 6_666,
                price: baselinePrice,
                hargaAgen: 0,
                hargaDinas: 10_000,
                pricingMode: "AUTO" as const,
                pricingSourceProductId: "pen",
                pricingConfigRevision: 6,
              },
            }),
          }],
        },
      },
    });

  return { edit, line, getWrites: () => writes };
}

describe("reviewing changed receipt pricing", () => {
  it("saves the reviewed proposal against the latest rule revision and resets approval", async () => {
    const { edit, line } = fixture();

    await expect(edit()).resolves.toMatchObject({ finalized: false });
    expect(line.reviewStatus).toBe("PENDING");
    expect(line.pricingSnapshot.units[0]).toMatchObject({
      price: 9_500,
      original: { costPrice: 6_666, price: 9_000, hargaAgen: 0, hargaDinas: 10_000 },
      pricingConfigRevision: 6,
    });
  });

  it("keeps the reviewed proposal while recording a changed current price as its baseline", async () => {
    const { edit, line } = fixture(9_600);

    await expect(edit()).resolves.toMatchObject({ finalized: false });
    expect(line.pricingSnapshot.units[0]).toMatchObject({
      price: 9_500,
      original: { price: 9_600 },
      pricingConfigRevision: 6,
    });
  });

  it("rejects a review when the displayed price is no longer current", async () => {
    const { edit, getWrites } = fixture(9_600);

    await expect(edit(9_000)).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(getWrites()).toBe(0);
  });

  it("does not silently refresh a stale snapshot without a displayed baseline", async () => {
    const { edit, getWrites } = fixture();

    await expect(edit(null)).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(getWrites()).toBe(0);
  });

  it("rejects a review if the pricing rule changes again while the form is open", async () => {
    const { edit, line, getWrites } = fixture();
    line.pricingUnits[0].pricingConfigRevision = 7;

    await expect(edit()).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(getWrites()).toBe(0);
  });

  it("rejects a review if unit conversion changes while the form is open", async () => {
    const { edit, line, getWrites } = fixture();
    line.pricingUnits[0].unitMultiplierToBase = 2;

    await expect(edit()).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(getWrites()).toBe(0);
  });

  it("refreshes related approved lines when the reviewed group prices change", async () => {
    const { line } = fixture();
    const currentSource = line.pricingUnits[0];
    const currentBox = {
      ...currentSource,
      productId: "box",
      unit: "Pak",
      unitMultiplierToBase: 12,
      costPrice: 79_992,
      price: 100_000,
      hargaDinas: null,
      pricingMode: "MANUAL" as const,
    };
    const savedBox = {
      ...line.pricingSnapshot.units[0],
      productId: "box",
      unit: "Pak",
      unitMultiplierToBase: 12,
      costPrice: 82_500,
      price: 105_000,
      hargaDinas: null,
      original: { costPrice: 79_992, price: 100_000, hargaAgen: 0, hargaDinas: null },
      pricingMode: "MANUAL",
    };
    const snapshot = { ...line.pricingSnapshot, units: [line.pricingSnapshot.units[0], savedBox] };
    const sourceLine = { ...line, pricingUnits: [currentSource, currentBox], pricingSnapshot: snapshot };
    const boxLine = {
      ...sourceLine, id: "line-2", productId: "box", unitMultiplierToBase: 12,
      expectedQuantity: 10, receivedQuantity: 10,
      goodsPurchaseItem: { ...line.goodsPurchaseItem, id: "purchase-item-2", productId: "box", quantity: 10 },
    };
    let receipt = { id: "receipt", storeId: "store", goodsPurchaseId: "purchase", lines: [sourceLine, boxLine] };
    const repository = {
      runInTransaction: async (callback: (tx: { receipt: typeof receipt }) => Promise<unknown>) => {
        const tx = { receipt: structuredClone(receipt) };
        const result = await callback(tx);
        receipt = tx.receipt;
        return result;
      },
      lockSubmittedReceipt: async (tx: { receipt: typeof receipt }) => structuredClone(tx.receipt),
      updateReceiptLine: async (tx: { receipt: typeof receipt }, input: { itemId: string }) => {
        Object.assign(tx.receipt.lines.find((candidate) => candidate.id === input.itemId)!, input);
      },
    } as unknown as InventoryInboundReceiptRepository;
    const pricing = {
      version: 2 as const,
      units: [
        {
          productId: "pen", costPrice: 6_875, price: 10_000, hargaAgen: 0, hargaDinas: 10_500, priceEdited: true,
          baseline: { unit: "Bh", unitMultiplierToBase: 1, costPrice: 6_666, price: 9_000, hargaAgen: 0, hargaDinas: 10_000,
            pricingMode: "AUTO" as const, pricingSourceProductId: "pen", pricingConfigRevision: 6 },
        },
        {
          productId: "box", costPrice: 82_500, price: 105_000, hargaAgen: 0, hargaDinas: null, priceEdited: true,
          baseline: { unit: "Pak", unitMultiplierToBase: 12, costPrice: 79_992, price: 100_000, hargaAgen: 0, hargaDinas: null,
            pricingMode: "MANUAL" as const, pricingSourceProductId: "pen", pricingConfigRevision: 6 },
        },
      ],
    };

    await expect(editInboundReceiptItem({
      repository, user: { id: "owner", role: "OWNER", storeId: "store" },
      receiptId: "receipt", itemId: "line-1", expectedUpdatedAt: updatedAt.toISOString(),
      input: { matchStatus: "MATCHED", receivedQuantity: 120, pricing },
    })).resolves.toMatchObject({ finalized: false });
    expect(receipt.lines.map((item) => item.reviewStatus)).toEqual(["PENDING", "PENDING"]);
    expect(receipt.lines[1].pricingSnapshot.units[0]).toMatchObject({ price: 10_000, pricingConfigRevision: 6 });
  });
});
