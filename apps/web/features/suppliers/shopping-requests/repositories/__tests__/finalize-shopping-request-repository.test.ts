import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
const finalizePurchase = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", async (original) => {
  const actual = await original<typeof import("@pos/db")>();
  return { Prisma: actual.Prisma, db: { $transaction: transaction } };
});
vi.mock("@/features/suppliers/goods-purchases/repositories/goods-purchases-repository", () => ({
  finalizeGoodsPurchaseIfReady: finalizePurchase,
}));

import { finalizeShoppingRequestRecord } from "../finalize-shopping-request-repository";

const actor = { id: "user-1", name: "Admin", storeId: "store-1" };
const input = {
  items: [{ shoppingRequestItemId: "item-1", productId: "dus", approvedQty: 12, latestUnitPrice: 1000, updateMasterHpp: false }],
  extraItems: [],
};

function makeTransaction() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "lock" }]),
    shoppingRequest: {
      findFirst: vi.fn().mockResolvedValue({
        id: "request-1", supplierId: "supplier-1", supplier: { id: "supplier-1", name: "Supplier", isActive: true },
        items: [{ id: "item-1", productId: "pcs", requestedQty: 12, product: { stockGroupId: "group-1" } }],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    shoppingRequestItem: { update: vi.fn().mockResolvedValue({}) },
    product: { findMany: vi.fn().mockResolvedValue([{
      id: "dus", name: "Kertas Dus", sku: "KDS", unit: "dus", stock: 2,
      stockGroupId: "group-1", stockGroup: null, unitMultiplierToBase: 12, costPrice: null,
    }]) },
    goodsPurchase: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "purchase-1" }),
    },
  };
}

describe("finalizeShoppingRequestRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finalizePurchase.mockResolvedValue({ finalized: true });
  });

  it("creates a reviewed purchase in the same transaction as the request decision", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));

    await expect(finalizeShoppingRequestRecord("request-1", input, actor)).resolves.toEqual({
      shoppingRequestId: "request-1", goodsPurchaseId: "purchase-1",
    });
    expect(tx.shoppingRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "REQUESTED", approvalFlowVersion: 2, storeId: "store-1" }),
      data: expect.objectContaining({ status: "APPROVED" }),
    }));
    expect(tx.shoppingRequestItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ productId: "dus", approvedQty: 12, decisionStatus: "APPROVED" }),
    }));
    expect(tx.goodsPurchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activeShoppingRequestKey: "request-1",
        items: { create: [expect.objectContaining({ productId: "dus", quantity: 12, reviewStatus: "APPROVED", latestUnitPrice: expect.anything() })] },
      }),
    }));
    expect(finalizePurchase).toHaveBeenCalledWith(tx, "purchase-1", actor, expect.any(Date));
  });

  it("propagates a financial failure from the transaction", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    finalizePurchase.mockRejectedValueOnce(new Error("expense failed"));

    await expect(finalizeShoppingRequestRecord("request-1", input, actor)).rejects.toThrow("expense failed");
  });
});
