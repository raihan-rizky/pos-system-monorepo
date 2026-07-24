import type { Product } from "@pos/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateInboundReceiptStockBundleInput } from "../../types/inventory-management";
import { finalizeInboundReceiptIfReady } from "../inbound-receipt-finalizer";

const tx = { id: "tx-finalizer" };
const now = new Date("2026-07-24T08:00:00.000Z");
const user = {
  id: "owner-1",
  name: "Owner",
  role: "OWNER" as const,
  storeId: "store-main",
};

function product(
  id: string,
  overrides: Partial<Product> & {
    stockGroupId?: string | null;
    unitMultiplierToBase?: number;
    conversionNeedsReview?: boolean;
  } = {},
): Product {
  return {
    id,
    name: id.toUpperCase(),
    sku: `SKU-${id}`,
    barcode: null,
    description: null,
    price: 10_000 as never,
    costPrice: 5_000 as never,
    hargaDinas: null,
    hargaAgen: null,
    stock: 0,
    minStock: 0,
    unit: id,
    size: null,
    material: null,
    categoryId: "category-1",
    brandId: null,
    storeId: "store-main",
    isActive: true,
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Product;
}

function line(
  overrides: Record<string, unknown> = {},
) {
  const receiptProduct = product("dus", {
    stockGroupId: "group-1",
    unitMultiplierToBase: 12,
  });

  return {
    id: "line-dus",
    productId: receiptProduct.id,
    status: "RECEIVED" as const,
    expectedQuantity: 2,
    receivedQuantity: 2,
    matchStatus: "MATCHED" as const,
    reviewStatus: "APPROVED" as const,
    approvedById: "owner-1",
    approvedByName: "Owner",
    approvedAt: now,
    note: null,
    product: receiptProduct,
    stockGroupId: receiptProduct.stockGroupId,
    unitMultiplierToBase: receiptProduct.unitMultiplierToBase,
    conversionNeedsReview: false,
    goodsPurchaseItem: {
      id: "gpi-dus",
      quantity: 10,
      latestUnitPrice: 120_000,
    },
    approvedReceivedExcludingCurrentReceipt: 0,
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: "receipt-1",
    storeId: "store-main",
    status: "SUBMITTED" as const,
    goodsPurchaseId: "purchase-1",
    goodsPurchaseNumber: "PB-202607-001",
    stockBundleId: null,
    supplierId: "supplier-1",
    supplierName: "CV Kertas",
    lines: [line()],
    ...overrides,
  };
}

function group(
  id = "group-1",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    storeId: "store-main",
    baseStock: 120,
    variants: [
      product("dus", {
        stockGroupId: id,
        unitMultiplierToBase: 12,
      }),
      product("pack", {
        stockGroupId: id,
        unitMultiplierToBase: 6,
      }),
      product("pcs", {
        stockGroupId: id,
        unitMultiplierToBase: 1,
      }),
    ],
    ...overrides,
  };
}

function createRepository(finalizableReceipt = receipt()) {
  const groups = new Map<string, ReturnType<typeof group>>([
    ["group-1", group()],
  ]);
  let logSequence = 0;

  return {
    lockSubmittedReceipt: vi.fn(async () => finalizableReceipt),
    lockGoodsPurchase: vi.fn(async () => true),
    findReceiptForFinalization: vi.fn(async () => finalizableReceipt),
    lockStockGroup: vi.fn(async (_tx, input: { stockGroupId: string }) =>
      groups.get(input.stockGroupId) ?? null,
    ),
    incrementStockGroupBase: vi.fn(async () => undefined),
    incrementStandaloneProductStock: vi.fn(
      async (_tx, input: { productId: string; quantity: number }) => {
        const standalone = finalizableReceipt.lines.find(
          (candidate) => candidate.productId === input.productId,
        )?.product as Product;
        return {
          product: standalone,
          beforeStock: standalone.stock,
          afterStock: standalone.stock + input.quantity,
        };
      },
    ),
    createCanonicalInventoryLog: vi.fn(async () => ({
      id: `log-${++logSequence}`,
    })),
    createReceiptStockBundle: vi.fn(
      async (
        _tx: unknown,
        _input: CreateInboundReceiptStockBundleInput,
      ) => ({ id: "bundle-1" }),
    ),
    markReceiptApproved: vi.fn(async () => ({
      id: "receipt-1",
      status: "APPROVED" as const,
    })),
    listGoodsPurchaseFulfillmentItems: vi.fn(async () => [
      { orderedQuantity: 10, approvedReceivedQuantity: 2 },
    ]),
    updateGoodsPurchaseFulfillment: vi.fn(async () => undefined),
    groups,
  };
}

function finalizerInput(repository: ReturnType<typeof createRepository>) {
  return {
    repository: repository as never,
    tx,
    receiptId: "receipt-1",
    user,
    now,
  };
}

describe("inbound receipt finalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns without stock movement while another line is pending", async () => {
    const pendingReceipt = receipt({
      lines: [
        line(),
        line({
          id: "line-pending",
          productId: "pending",
          reviewStatus: "PENDING",
        }),
      ],
    });
    const repository = createRepository(pendingReceipt);

    const result = await finalizeInboundReceiptIfReady(
      finalizerInput(repository),
    );

    expect(result).toEqual({
      data: { id: "receipt-1", status: "SUBMITTED" },
      finalized: false,
    });
    expect(repository.lockGoodsPurchase).not.toHaveBeenCalled();
    expect(repository.incrementStockGroupBase).not.toHaveBeenCalled();
    expect(repository.createCanonicalInventoryLog).not.toHaveBeenCalled();
    expect(repository.createReceiptStockBundle).not.toHaveBeenCalled();
  });

  it("updates one shared base stock and snapshots every active variant", async () => {
    const repository = createRepository();

    const result = await finalizeInboundReceiptIfReady(
      finalizerInput(repository),
    );

    expect(repository.incrementStockGroupBase).toHaveBeenCalledTimes(1);
    expect(repository.incrementStockGroupBase).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        stockGroupId: "group-1",
        baseDelta: 24,
      }),
    );
    expect(result.bundle?.variantImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: "dus", delta: 2 }),
        expect.objectContaining({ productId: "pack", delta: 4 }),
        expect.objectContaining({ productId: "pcs", delta: 24 }),
      ]),
    );
    expect(repository.incrementStandaloneProductStock).not.toHaveBeenCalled();
  });

  it("creates canonical cost movement once and does not duplicate it for variants", async () => {
    const repository = createRepository();

    await finalizeInboundReceiptIfReady(finalizerInput(repository));

    expect(repository.createCanonicalInventoryLog).toHaveBeenCalledTimes(1);
    expect(repository.createCanonicalInventoryLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        productId: "dus",
        quantity: 2,
        unitCost: 120_000,
      }),
    );
    const bundleInput =
      repository.createReceiptStockBundle.mock.calls[0]?.[1];
    expect(bundleInput.canonicalImpacts).toHaveLength(1);
    expect(bundleInput.variantImpacts).toHaveLength(3);
    expect(
      bundleInput.variantImpacts.every(
        (impact: { inventoryLogId?: string | null }) =>
          impact.inventoryLogId == null,
      ),
    ).toBe(true);
  });

  it("creates one supplier-titled bundle and stores PB number only in summary detail", async () => {
    const repository = createRepository();

    await finalizeInboundReceiptIfReady(finalizerInput(repository));

    expect(repository.createReceiptStockBundle).toHaveBeenCalledTimes(1);
    expect(repository.createReceiptStockBundle).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        title: "CV Kertas",
        goodsPurchaseNumber: "PB-202607-001",
        type: "INBOUND_RECEIPT",
      }),
    );
    const bundleInput =
      repository.createReceiptStockBundle.mock.calls[0]?.[1];
    expect(bundleInput.title).not.toContain("PB-202607-001");
  });

  it("rolls back final item approval when finalization quantities conflict", async () => {
    const conflictingReceipt = receipt({
      lines: [
        line({
          receivedQuantity: 2,
          goodsPurchaseItem: {
            id: "gpi-dus",
            quantity: 10,
            latestUnitPrice: 120_000,
          },
          approvedReceivedExcludingCurrentReceipt: 9,
        }),
      ],
    });
    const repository = createRepository(conflictingReceipt);

    await expect(
      finalizeInboundReceiptIfReady(finalizerInput(repository)),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repository.incrementStockGroupBase).not.toHaveBeenCalled();
    expect(repository.createCanonicalInventoryLog).not.toHaveBeenCalled();
    expect(repository.createReceiptStockBundle).not.toHaveBeenCalled();
    expect(repository.markReceiptApproved).not.toHaveBeenCalled();
  });

  it("increments a standalone product once and keeps it in the same receipt bundle", async () => {
    const standalone = product("standalone", { stock: 5 });
    const standaloneReceipt = receipt({
      lines: [
        line({
          id: "line-standalone",
          productId: standalone.id,
          receivedQuantity: 3,
          product: standalone,
          stockGroupId: null,
          unitMultiplierToBase: 1,
          goodsPurchaseItem: {
            id: "gpi-standalone",
            quantity: 10,
            latestUnitPrice: 7_500,
          },
        }),
      ],
    });
    const repository = createRepository(standaloneReceipt);

    const result = await finalizeInboundReceiptIfReady(
      finalizerInput(repository),
    );

    expect(repository.incrementStandaloneProductStock).toHaveBeenCalledTimes(1);
    expect(repository.incrementStandaloneProductStock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        productId: "standalone",
        quantity: 3,
      }),
    );
    expect(repository.incrementStockGroupBase).not.toHaveBeenCalled();
    expect(result.bundle?.canonicalImpacts).toEqual([
      expect.objectContaining({
        productId: "standalone",
        beforeStock: 5,
        afterStock: 8,
        delta: 3,
      }),
    ]);
  });

  it("updates multiple stock groups once each inside one bundle", async () => {
    const roll = product("roll", {
      stockGroupId: "group-2",
      unitMultiplierToBase: 10,
    });
    const multiGroupReceipt = receipt({
      lines: [
        line(),
        line({
          id: "line-roll",
          productId: "roll",
          receivedQuantity: 3,
          product: roll,
          stockGroupId: "group-2",
          unitMultiplierToBase: 10,
          goodsPurchaseItem: {
            id: "gpi-roll",
            quantity: 5,
            latestUnitPrice: 40_000,
          },
        }),
      ],
    });
    const repository = createRepository(multiGroupReceipt);
    repository.groups.set(
      "group-2",
      group("group-2", {
        baseStock: 50,
        variants: [
          roll,
          product("sheet", {
            stockGroupId: "group-2",
            unitMultiplierToBase: 1,
          }),
        ],
      }),
    );

    const result = await finalizeInboundReceiptIfReady(
      finalizerInput(repository),
    );

    expect(repository.incrementStockGroupBase).toHaveBeenCalledTimes(2);
    expect(repository.incrementStockGroupBase).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ stockGroupId: "group-1", baseDelta: 24 }),
    );
    expect(repository.incrementStockGroupBase).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ stockGroupId: "group-2", baseDelta: 30 }),
    );
    expect(repository.createReceiptStockBundle).toHaveBeenCalledTimes(1);
    expect(repository.createCanonicalInventoryLog).toHaveBeenCalledTimes(2);
    expect(result.bundle?.stockGroupCount).toBe(2);
  });

  it("approves an all-zero receipt without stock or cost movement and keeps fulfillment not received", async () => {
    const zeroReceipt = receipt({
      lines: [line({ receivedQuantity: 0 })],
    });
    const repository = createRepository(zeroReceipt);
    repository.listGoodsPurchaseFulfillmentItems.mockResolvedValueOnce([
      { orderedQuantity: 10, approvedReceivedQuantity: 0 },
    ]);

    const result = await finalizeInboundReceiptIfReady(
      finalizerInput(repository),
    );

    expect(result).toMatchObject({
      data: { id: "receipt-1", status: "APPROVED" },
      finalized: true,
      bundle: {
        canonicalImpacts: [],
        variantImpacts: [],
      },
    });
    expect(repository.incrementStockGroupBase).not.toHaveBeenCalled();
    expect(repository.incrementStandaloneProductStock).not.toHaveBeenCalled();
    expect(repository.createCanonicalInventoryLog).not.toHaveBeenCalled();
    expect(repository.createReceiptStockBundle).toHaveBeenCalledTimes(1);
    expect(repository.updateGoodsPurchaseFulfillment).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ fulfillmentStatus: "NOT_RECEIVED" }),
    );
  });

  it("refuses an existing stock bundle without duplicating finalization effects", async () => {
    const repository = createRepository(
      receipt({ stockBundleId: "bundle-existing" }),
    );

    await expect(
      finalizeInboundReceiptIfReady(finalizerInput(repository)),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(repository.lockGoodsPurchase).not.toHaveBeenCalled();
    expect(repository.incrementStockGroupBase).not.toHaveBeenCalled();
    expect(repository.incrementStandaloneProductStock).not.toHaveBeenCalled();
    expect(repository.createCanonicalInventoryLog).not.toHaveBeenCalled();
    expect(repository.createReceiptStockBundle).not.toHaveBeenCalled();
    expect(repository.markReceiptApproved).not.toHaveBeenCalled();
  });
});
