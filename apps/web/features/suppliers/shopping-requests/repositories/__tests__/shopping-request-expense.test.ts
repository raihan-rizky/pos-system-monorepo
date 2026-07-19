import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  shoppingRequest: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  shoppingRequestItem: { updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  product: { findMany: vi.fn(), updateMany: vi.fn() },
  productStockGroup: { findMany: vi.fn(), updateMany: vi.fn() },
  inventoryLog: { create: vi.fn() },
  expense: { create: vi.fn() },
}));

const DecimalMock = vi.hoisted(() =>
  class DecimalMock {
    static ROUND_HALF_UP = 4;
    private readonly value: number;

    constructor(value: unknown) {
      this.value = Number(
        value && typeof value === "object" && "toString" in value
          ? value.toString()
          : value,
      );
    }

    mul(other: DecimalMock) {
      return new DecimalMock(this.value * Number(other.toString()));
    }

    add(other: DecimalMock) {
      return new DecimalMock(this.value + Number(other.toString()));
    }

    toDecimalPlaces(places: number) {
      const factor = 10 ** places;
      return new DecimalMock(Math.round(this.value * factor) / factor);
    }

    toString() {
      return String(this.value);
    }
  },
);

vi.mock("@pos/db", () => {
  return {
    Prisma: { Decimal: DecimalMock },
    db: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
  };
});

import { approveShoppingRequestItemsWithStock } from "../shopping-requests-repository";

const createdAt = new Date("2026-07-02T03:15:00.000Z");

function product(id: string, name: string, costPrice: string) {
  return {
    id,
    name,
    sku: id.toUpperCase(),
    unit: "pcs",
    stock: 10,
    costPrice: { toString: () => costPrice },
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
    stockGroup: null,
    isActive: true,
    storeId: "store-1",
  };
}

describe("approveShoppingRequestItemsWithStock expense integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.shoppingRequest.findFirst.mockResolvedValue({
      id: "request-1",
      storeId: "store-1",
      number: "DPB-202607-001",
      status: "REQUESTED",
      stockAppliedAt: null,
      supplierId: "supplier-1",
      supplier: { id: "supplier-1", name: "CV Kertas", isActive: true },
      inboundReceipts: [],
      createdAt,
      items: [
        {
          id: "item-1",
          productId: "product-1",
          productName: "Kertas",
          requestedQty: 2,
          approvedQty: 2,
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "PENDING",
          costPriceSnapshot: null,
          product: { costPrice: { toString: () => "10000.00" } },
        },
        {
          id: "item-2",
          productId: "product-2",
          productName: "Tinta",
          requestedQty: 3,
          approvedQty: 3,
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "PENDING",
          costPriceSnapshot: null,
          product: { costPrice: { toString: () => "7500.00" } },
        },
      ],
    });
    tx.shoppingRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.shoppingRequestItem.updateMany.mockResolvedValue({ count: 1 });
    tx.shoppingRequestItem.count.mockResolvedValue(0);
    tx.product.findMany.mockResolvedValue([
      product("product-1", "Kertas", "10000.00"),
      product("product-2", "Tinta", "7500.00"),
    ]);
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.shoppingRequestItem.update.mockResolvedValue({});
    tx.inventoryLog.create.mockResolvedValue({});
    tx.expense.create.mockResolvedValue({ id: "expense-1" });
    tx.shoppingRequest.update.mockResolvedValue({
      id: "request-1",
      number: "DPB-202607-001",
      status: "APPROVED",
      supplierId: "supplier-1",
      requestedByName: "Admin",
      approvedByName: "Owner",
      approvedById: "owner-1",
      approvedAt: new Date("2026-07-19T01:00:00.000Z"),
      note: null,
      stockAppliedAt: new Date("2026-07-19T01:00:00.000Z"),
      createdAt,
      supplier: { id: "supplier-1", name: "CV Kertas" },
      items: [
        {
          id: "item-1",
          productId: "product-1",
          productName: "Kertas",
          unit: "pcs",
          stockOnHand: 10,
          requestedQty: 2,
          approvedQty: 2,
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "APPROVED",
          decidedById: "owner-1",
          decidedByName: "Owner",
          decidedAt: new Date("2026-07-19T01:00:00.000Z"),
          stockAppliedAt: new Date("2026-07-19T01:00:00.000Z"),
          product: product("product-1", "Kertas", "10000.00"),
        },
        {
          id: "item-2",
          productId: "product-2",
          productName: "Tinta",
          unit: "pcs",
          stockOnHand: 10,
          requestedQty: 3,
          approvedQty: 3,
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "APPROVED",
          decidedById: "owner-1",
          decidedByName: "Owner",
          decidedAt: new Date("2026-07-19T01:00:00.000Z"),
          stockAppliedAt: new Date("2026-07-19T01:00:00.000Z"),
          product: product("product-2", "Tinta", "7500.00"),
        },
      ],
    });
  });

  it("creates one SUPPLIES expense from approved quantities and cost snapshots", async () => {
    await approveShoppingRequestItemsWithStock({
      id: "request-1",
      actor: { id: "owner-1", name: "Owner", storeId: "store-1" },
      items: [
        { id: "item-1", stockMode: "PRODUCT_ONLY" },
        { id: "item-2", stockMode: "PRODUCT_ONLY" },
      ],
      approveAllPending: true,
    });

    expect(tx.shoppingRequestItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ costPriceSnapshot: expect.anything() }),
    });
    expect(tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-1",
        recordedById: "owner-1",
        shoppingRequestId: "request-1",
        applicantName: "CV Kertas",
        category: "SUPPLIES",
        amount: expect.objectContaining({ toString: expect.any(Function) }),
        changeAmount: 0,
        occurredAt: createdAt,
        hasMissingCostSnapshot: false,
      }),
    });
    const amount = tx.expense.create.mock.calls[0][0].data.amount;
    expect(amount.toString()).toBe("42500");
  });

  it("keeps approval valid at Rp0 and marks a missing cost-price snapshot", async () => {
    tx.shoppingRequest.findFirst.mockResolvedValueOnce({
      id: "request-1",
      storeId: "store-1",
      number: "DPB-202607-001",
      status: "REQUESTED",
      stockAppliedAt: null,
      supplierId: "supplier-1",
      supplier: { id: "supplier-1", name: "CV Kertas", isActive: true },
      inboundReceipts: [],
      createdAt,
      items: [
        {
          id: "item-1",
          productId: "product-1",
          productName: "Kertas",
          requestedQty: 2,
          approvedQty: 2,
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "PENDING",
          costPriceSnapshot: null,
          product: { costPrice: null },
        },
      ],
    });
    tx.product.findMany.mockResolvedValueOnce([
      { ...product("product-1", "Kertas", "0"), costPrice: null },
    ]);

    await approveShoppingRequestItemsWithStock({
      id: "request-1",
      actor: { id: "owner-1", name: "Owner", storeId: "store-1" },
      items: [{ id: "item-1", stockMode: "PRODUCT_ONLY" }],
      approveAllPending: true,
    });

    expect(tx.shoppingRequestItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { costPriceSnapshot: null },
    });
    expect(tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: expect.objectContaining({ toString: expect.any(Function) }),
        hasMissingCostSnapshot: true,
      }),
    });
    expect(tx.expense.create.mock.calls[0][0].data.amount.toString()).toBe("0");
  });

  it("still creates one Rp0 expense when every approved quantity is zero", async () => {
    tx.shoppingRequest.findFirst.mockResolvedValueOnce({
      id: "request-1",
      storeId: "store-1",
      number: "DPB-202607-001",
      status: "REQUESTED",
      stockAppliedAt: null,
      supplierId: "supplier-1",
      supplier: { id: "supplier-1", name: "CV Kertas", isActive: true },
      inboundReceipts: [],
      createdAt,
      items: [
        {
          id: "item-1",
          productId: "product-1",
          productName: "Kertas",
          requestedQty: 2,
          approvedQty: 0,
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "PENDING",
          costPriceSnapshot: null,
          product: { costPrice: { toString: () => "10000.00" } },
        },
      ],
    });
    tx.product.findMany.mockResolvedValueOnce([
      product("product-1", "Kertas", "10000.00"),
    ]);

    await approveShoppingRequestItemsWithStock({
      id: "request-1",
      actor: { id: "owner-1", name: "Owner", storeId: "store-1" },
      items: [{ id: "item-1", stockMode: "PRODUCT_ONLY" }],
      approveAllPending: true,
    });

    expect(tx.inventoryLog.create).not.toHaveBeenCalled();
    expect(tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hasMissingCostSnapshot: false }),
    });
    expect(tx.expense.create.mock.calls[0][0].data.amount.toString()).toBe("0");
  });
});
