import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  shoppingRequest: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  shoppingRequestItem: {
    updateMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
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

    toDecimalPlaces() {
      return new DecimalMock(this.value);
    }

    toString() {
      return String(this.value);
    }
  },
);

const transactionMock = vi.hoisted(() =>
  vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
);

vi.mock("@pos/db", () => ({
  Prisma: { Decimal: DecimalMock },
  db: {
    $transaction: transactionMock,
  },
}));

import * as repository from "../shopping-requests-repository";

const actor = { id: "owner-1", name: "Owner", storeId: "store-1" };
const now = new Date("2026-07-19T02:00:00.000Z");

function product(id: string) {
  return {
    id,
    name: `Produk ${id}`,
    sku: id.toUpperCase(),
    unit: "pcs",
    stock: 10,
    costPrice: { toString: () => "5000" },
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
    stockGroup: null,
    isActive: true,
    storeId: "store-1",
  };
}

function item(id: string, approvedQty: number | null) {
  return {
    id,
    productId: `product-${id}`,
    productName: `Produk ${id}`,
    unit: "pcs",
    stockOnHand: 10,
    requestedQty: 5,
    approvedQty,
    stockMode: "PRODUCT_ONLY" as "PRODUCT_ONLY" | "GROUP_STOCK",
    decisionStatus: "PENDING" as const,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    stockAppliedAt: null,
    costPriceSnapshot: null,
    product: product(`product-${id}`),
  };
}

function request(items: ReturnType<typeof item>[]) {
  return {
    id: "request-1",
    storeId: "store-1",
    number: "DPB-202607-001",
    status: "REQUESTED" as const,
    stockAppliedAt: null,
    supplierId: "supplier-1",
    supplier: {
      id: "supplier-1",
      name: "Supplier Satu",
      isActive: true,
    },
    inboundReceipts: [],
    requestedByName: "Admin",
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
    cancelledAt: null,
    note: null,
    createdAt: now,
    items,
  };
}

describe("shopping request item decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.shoppingRequestItem.updateMany.mockResolvedValue({ count: 1 });
    tx.shoppingRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.shoppingRequestItem.update.mockResolvedValue({});
    tx.shoppingRequestItem.deleteMany.mockResolvedValue({ count: 0 });
    tx.shoppingRequestItem.create.mockResolvedValue({});
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.productStockGroup.findMany.mockResolvedValue([]);
    tx.inventoryLog.create.mockResolvedValue({});
    tx.expense.create.mockResolvedValue({});
  });

  it("saves an approved quantity without touching stock", async () => {
    const save = (repository as Record<string, unknown>)
      .saveShoppingRequestApprovedQuantities as
      | ((input: unknown) => Promise<unknown>)
      | undefined;
    expect(save).toBeTypeOf("function");
    if (!save) return;
    const row = request([item("1", null)]);
    tx.shoppingRequest.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        items: [{ ...row.items[0], approvedQty: 4 }],
      });

    const result = await save({
      id: "request-1",
      actor,
      items: [{ id: "1", approvedQty: 4 }],
    });

    expect(tx.shoppingRequestItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "1",
        shoppingRequestId: "request-1",
        decisionStatus: "PENDING",
      },
      data: { approvedQty: 4 },
    });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        decidedItemCount: 0,
        pendingItemCount: 1,
        items: [
          expect.objectContaining({
            decisionStatus: "PENDING",
            decidedAt: null,
            itemStockAppliedAt: null,
          }),
        ],
      }),
    );
  });

  it("always scopes list queries to the actor store", () => {
    const where = repository.buildShoppingRequestWhere({
      storeId: "store-1",
      skip: 0,
      take: 20,
    });

    expect(where).toEqual(expect.objectContaining({ storeId: "store-1" }));
  });

  it("approves one item immediately and keeps the request open", async () => {
    const approve = (repository as Record<string, unknown>)
      .approveShoppingRequestItemsWithStock as
      | ((input: unknown) => Promise<unknown>)
      | undefined;
    expect(approve).toBeTypeOf("function");
    if (!approve) return;
    const row = request([item("1", 4), item("2", null)]);
    tx.shoppingRequest.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(row);
    tx.shoppingRequestItem.count.mockResolvedValue(1);
    tx.product.findMany.mockResolvedValue([product("product-1")]);

    await approve({
      id: "request-1",
      actor,
      items: [{ id: "1", stockMode: "PRODUCT_ONLY" }],
      approveAllPending: false,
    });

    expect(tx.shoppingRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        storeId: "store-1",
        status: "REQUESTED",
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(tx.shoppingRequestItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "1",
        shoppingRequestId: "request-1",
        decisionStatus: "PENDING",
        approvedQty: { not: null },
      },
      data: expect.objectContaining({
        decisionStatus: "APPROVED",
        decidedById: "owner-1",
        decidedByName: "Owner",
        stockMode: "PRODUCT_ONLY",
      }),
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: 4 } } }),
    );
    expect(tx.inventoryLog.create).toHaveBeenCalledTimes(1);
    expect(tx.shoppingRequest.update).not.toHaveBeenCalled();
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it("allows enough time for the item approval transaction", async () => {
    const approve = (repository as Record<string, unknown>)
      .approveShoppingRequestItemsWithStock as
      | ((input: unknown) => Promise<unknown>)
      | undefined;
    expect(approve).toBeTypeOf("function");
    if (!approve) return;
    const row = request([item("1", 4), item("2", null)]);
    tx.shoppingRequest.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(row);
    tx.shoppingRequestItem.count.mockResolvedValue(1);
    tx.product.findMany.mockResolvedValue([product("product-1")]);

    await approve({
      id: "request-1",
      actor,
      items: [{ id: "1", stockMode: "PRODUCT_ONLY" }],
      approveAllPending: false,
    });

    expect(transactionMock).toHaveBeenLastCalledWith(
      expect.any(Function),
      { timeout: 15_000 },
    );
  });

  it("records zero as rejected without a stock mutation", async () => {
    const approve = (repository as Record<string, unknown>)
      .approveShoppingRequestItemsWithStock as
      | ((input: unknown) => Promise<unknown>)
      | undefined;
    expect(approve).toBeTypeOf("function");
    if (!approve) return;
    const row = request([item("1", 0), item("2", null)]);
    tx.shoppingRequest.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(row);
    tx.shoppingRequestItem.count.mockResolvedValue(1);
    tx.product.findMany.mockResolvedValue([product("product-1")]);

    await approve({
      id: "request-1",
      actor,
      items: [{ id: "1", stockMode: "PRODUCT_ONLY" }],
      approveAllPending: false,
    });

    expect(tx.shoppingRequestItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ decisionStatus: "REJECTED" }),
      }),
    );
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.create).not.toHaveBeenCalled();
  });

  it("serializes cancellation and refuses it after an item decision", async () => {
    const cancel = (repository as Record<string, unknown>)
      .cancelShoppingRequestIfUndecided as
      | ((input: unknown) => Promise<unknown>)
      | undefined;
    expect(cancel).toBeTypeOf("function");
    if (!cancel) return;

    tx.shoppingRequestItem.count.mockResolvedValueOnce(1);

    await expect(
      cancel({ id: "request-1", actor }),
    ).rejects.toThrow("ALREADY_DECIDED");

    expect(tx.shoppingRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        storeId: "store-1",
        status: "REQUESTED",
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(tx.shoppingRequestItem.count).toHaveBeenCalledWith({
      where: {
        shoppingRequestId: "request-1",
        decisionStatus: { not: "PENDING" },
      },
    });
    expect(tx.shoppingRequest.update).not.toHaveBeenCalled();
  });

  it("resets the saved approved quantity only when the requested quantity changes", async () => {
    const updateRequest = (repository as Record<string, unknown>)
      .updateShoppingRequestWithItems as
      | ((input: unknown) => Promise<unknown>)
      | undefined;
    expect(updateRequest).toBeTypeOf("function");
    if (!updateRequest) return;
    const existing = request([
      { ...item("1", 4), stockMode: "GROUP_STOCK" as const },
      item("2", 3),
    ]);
    tx.shoppingRequest.findFirst.mockResolvedValue(existing);
    tx.shoppingRequestItem.deleteMany.mockResolvedValueOnce({ count: 1 });
    tx.shoppingRequest.update.mockResolvedValue({
      ...existing,
      supplier: { id: "supplier-2", name: "Supplier Dua" },
      items: [
        {
          ...existing.items[0],
          requestedQty: 7,
          approvedQty: null,
          stockMode: "PRODUCT_ONLY",
        },
      ],
    });

    await updateRequest({
      id: "request-1",
      actor,
      supplierId: "supplier-2",
      note: "Diperbarui",
      items: [
        {
          productId: "product-1",
          productName: "Produk 1",
          unit: "pcs",
          stockOnHand: 12,
          requestedQty: 7,
          stockMode: "PRODUCT_ONLY",
        },
      ],
    });

    expect(tx.shoppingRequestItem.deleteMany).toHaveBeenCalledWith({
      where: {
        shoppingRequestId: "request-1",
        id: { in: ["2"] },
        decisionStatus: "PENDING",
      },
    });
    expect(tx.shoppingRequestItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: "1",
        shoppingRequestId: "request-1",
        decisionStatus: "PENDING",
      },
      data: {
        productName: "Produk 1",
        unit: "pcs",
        stockOnHand: 12,
        requestedQty: 7,
        approvedQty: null,
        stockMode: "PRODUCT_ONLY",
      },
    });
    expect(tx.shoppingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-1" },
        data: { supplierId: "supplier-2", note: "Diperbarui" },
      }),
    );
  });
});
