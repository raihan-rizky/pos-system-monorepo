import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: applyProductStockDeltasMock,
  StockMutationError: class StockMutationError extends Error {
    constructor(message: string, public readonly details: unknown) {
      super(message);
    }
  },
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
      update: transactionUpdateMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {
    Decimal: class Decimal {
      constructor(public value: number | string) {}
      toNumber() { return Number(this.value); }
      toString() { return String(this.value); }
    },
  },
}));

function makeRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/transactions/${id}/items`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function existingTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    storeId: "store-main",
    status: "COMPLETED",
    discount: 0,
    items: [{ productId: "p1", quantity: 2 }],
    ...overrides,
  };
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    productId: "p1",
    productName: "Product 1",
    quantity: 2,
    unitPrice: 1000,
    appliedUnitPrice: 1000,
    originalUnitPrice: 1000,
    subtotal: 2000,
    ...overrides,
  };
}

describe("PATCH /api/transactions/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "User One",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindFirstMock.mockResolvedValue(existingTransaction());
    transactionUpdateMock.mockResolvedValue({ id: "tx-1" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: { update: transactionUpdateMock },
      }),
    );
  });

  it("updates items and recalculates totals for a pending transaction (no stock reconcile)", async () => {
    transactionFindFirstMock.mockResolvedValue(
      existingTransaction({ status: "PENDING_APPROVAL", items: [] }),
    );

    const response = await PATCH(
      makeRequest("tx-1", {
        items: [
          line({ productId: "p1", quantity: 2, unitPrice: 50000, appliedUnitPrice: 50000, originalUnitPrice: 50000, subtotal: 100000 }),
          line({ productId: "p2", productName: "Product 2", quantity: 1, unitPrice: 20000, appliedUnitPrice: 20000, originalUnitPrice: 20000, subtotal: 20000 }),
        ],
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    const args = transactionUpdateMock.mock.calls[0][0];
    expect(args.data.subtotal).toBe(120000);
    expect(args.data.total).toBe(120000);
    // Stock was never deducted for a PENDING_APPROVAL request, so nothing to reconcile.
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("recomputes subtotal/total server-side and ignores a forged client subtotal", async () => {
    const response = await PATCH(
      makeRequest("tx-1", {
        items: [line({ subtotal: 0 })], // forged subtotal
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    const args = transactionUpdateMock.mock.calls[0][0];
    expect(args.data.subtotal).toBe(2000);
    expect(args.data.total).toBe(2000);
    expect(args.data.items.create[0].subtotal).toBe(2000);
  });

  it("deducts the extra stock when an item quantity is increased on a COMPLETED sale", async () => {
    const response = await PATCH(
      makeRequest("tx-1", { items: [line({ quantity: 5, subtotal: 5000 })] }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(applyProductStockDeltasMock).toHaveBeenCalledTimes(1);
    const arg = applyProductStockDeltasMock.mock.calls[0][1];
    expect(arg.storeId).toBe("store-main");
    expect(arg.items).toEqual([{ productId: "p1", delta: -3 }]);
  });

  it("restores stock when an item quantity is reduced", async () => {
    transactionFindFirstMock.mockResolvedValue(
      existingTransaction({ items: [{ productId: "p1", quantity: 5 }] }),
    );

    await PATCH(
      makeRequest("tx-1", { items: [line({ quantity: 2, subtotal: 2000 })] }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    const arg = applyProductStockDeltasMock.mock.calls[0][1];
    expect(arg.items).toEqual([{ productId: "p1", delta: 3 }]);
  });

  it("restores all old stock and deducts new when a product is swapped", async () => {
    await PATCH(
      makeRequest("tx-1", {
        items: [line({ productId: "p2", productName: "Product 2", quantity: 2, subtotal: 2000 })],
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    const arg = applyProductStockDeltasMock.mock.calls[0][1];
    expect(arg.items).toEqual(
      expect.arrayContaining([
        { productId: "p1", delta: 2 },
        { productId: "p2", delta: -2 },
      ]),
    );
    expect(arg.items).toHaveLength(2);
  });

  it("rejects editing a VOIDED transaction without touching stock", async () => {
    transactionFindFirstMock.mockResolvedValue(
      existingTransaction({ status: "VOIDED" }),
    );

    const response = await PATCH(
      makeRequest("tx-1", { items: [line({ quantity: 5, subtotal: 5000 })] }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(409);
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
    expect(transactionUpdateMock).not.toHaveBeenCalled();
  });

  it("scopes the lookup by store-main when the user has no storeId, never undefined", async () => {
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: null });

    await PATCH(
      makeRequest("tx-1", { items: [line()] }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    const where = transactionFindFirstMock.mock.calls[0][0].where;
    expect(where.storeId).toBe("store-main");
  });

  it("preserves the original discount when recomputing the total", async () => {
    transactionFindFirstMock.mockResolvedValue(
      existingTransaction({ discount: 500 }),
    );

    await PATCH(
      makeRequest("tx-1", { items: [line({ quantity: 2, subtotal: 2000 })] }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    const args = transactionUpdateMock.mock.calls[0][0];
    expect(args.data.subtotal).toBe(2000);
    expect(args.data.total).toBe(1500);
  });
});
