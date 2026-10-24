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
import { GroupPricingError } from "@/features/product-stock-groups/group-pricing-service";
import { StockMutationConflictError } from "@/features/product-stock-groups/stock-group-lock";

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
      stockGroupId: "group-1", stockGroup: null, unitMultiplierToBase: 12, costPrice: null, isActive: true,
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
        paymentMethod: "TRANSFER",
        paymentDueDate: null,
        items: { create: [expect.objectContaining({ productId: "dus", quantity: 12, reviewStatus: "APPROVED", latestUnitPrice: expect.anything() })] },
      }),
    }));
    expect(finalizePurchase).toHaveBeenCalledWith(tx, "purchase-1", actor, expect.any(Date));
  });

  it("stores the giro method and due date with the approved purchase", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    await finalizeShoppingRequestRecord("request-1", {
      ...input, paymentMethod: "GIRO", paymentDueDate: "2026-11-02",
    }, actor);
    expect(tx.goodsPurchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: "GIRO", paymentDueDate: new Date("2026-11-02T00:00:00.000Z") }),
    }));
  });

  it("does not store a leftover giro date for a transfer", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    await finalizeShoppingRequestRecord("request-1", {
      ...input, paymentMethod: "TRANSFER", paymentDueDate: "2026-11-02",
    }, actor);
    expect(tx.goodsPurchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: "TRANSFER", paymentDueDate: null }),
    }));
  });

  it("propagates a financial failure from the transaction", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    finalizePurchase.mockRejectedValueOnce(new Error("expense failed"));

    await expect(finalizeShoppingRequestRecord("request-1", input, actor)).rejects.toThrow("expense failed");
  });

  it("returns actionable Auto follower validation from purchase finalization", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    const message = "HPP satuan Otomatis mengikuti acuan. Ubah HPP acuan atau pilih mode Manual terlebih dahulu.";
    finalizePurchase.mockRejectedValueOnce(new GroupPricingError(message, 422));
    await expect(finalizeShoppingRequestRecord("request-1", input, actor)).rejects.toMatchObject({
      name: "FinalApprovalError", status: 422, message,
    });
  });

  it("maps changed product relations to a retryable final-approval conflict", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    finalizePurchase.mockRejectedValueOnce(new StockMutationConflictError());
    await expect(finalizeShoppingRequestRecord("request-1", input, actor)).rejects.toMatchObject({
      name: "FinalApprovalError", status: 409, message: expect.stringMatching(/Muat ulang/),
    });
  });

  it("loads inactive original items for zero-quantity decisions without purchasing them", async () => {
    const tx = makeTransaction();
    const products = [
      { id: "pcs", name: "Kertas Pcs", sku: "PCS", unit: "pcs", stock: 0, stockGroupId: "group-1", stockGroup: null, unitMultiplierToBase: 1, costPrice: null, isActive: false },
      { id: "dus", name: "Kertas Dus", sku: "DUS", unit: "dus", stock: 2, stockGroupId: "group-1", stockGroup: null, unitMultiplierToBase: 12, costPrice: null, isActive: true },
    ];
    tx.product.findMany.mockImplementation(async ({ where }) => products.filter((product) =>
      where.id.in.includes(product.id) && (where.isActive === undefined || product.isActive === where.isActive),
    ));
    transaction.mockImplementationOnce((callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    await finalizeShoppingRequestRecord("request-1", {
      items: [{ ...input.items[0], productId: "pcs", approvedQty: 0 }],
      extraItems: [{ productId: "dus", quantity: 1, latestUnitPrice: 1000, updateMasterHpp: false }],
    }, actor);
    const created = tx.goodsPurchase.create.mock.calls[0][0].data.items.create;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ productId: "dus", quantity: 1 });
    expect(tx.shoppingRequestItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decisionStatus: "REJECTED", approvedQty: 0 }) }));
  });
});
