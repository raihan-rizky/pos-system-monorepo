import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const transactionFindLockedMock = vi.hoisted(() => vi.fn());
const transactionLockMock = vi.hoisted(() => vi.fn());
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
  it("protects finalized printing receipt content from the general item editor", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({printingSubcategory:"PLAT"}));
    const response=await PATCH(makeRequest("tx-1",{items:[line()]}),{params:Promise.resolve({id:"tx-1"})});
    expect(response.status).toBe(409);
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });
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
    transactionLockMock.mockResolvedValue([{ id: "tx-1" }]);
    transactionFindLockedMock.mockImplementation(async () => transactionFindFirstMock.mock.results.at(-1)?.value);
    applyProductStockDeltasMock.mockResolvedValue([]);
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        $queryRaw: transactionLockMock,
        transaction: { update: transactionUpdateMock, findFirst: transactionFindLockedMock },
      }),
    );
  });

  it("preserves saved document names when identified source rows are reordered and edited", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [
      { id: "saved-a", productId: "p1", productName: "Product 1", documentName: "Banner acara", quantity: 2, discount: 0 },
      { id: "saved-b", productId: "p1", productName: "Product 1", documentName: "Banner informasi", quantity: 2, discount: 0 },
    ] }));
    const response = await PATCH(makeRequest("tx-1", { items: [
      line({ sourceItemId: "saved-b", quantity: 3, documentName: "Nama palsu dari klien" }),
      line({ sourceItemId: "saved-a" }),
    ] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionFindFirstMock.mock.calls[0][0].select.items.select.documentName).toBe(true);
    expect(transactionUpdateMock.mock.calls[0][0].data.items.create).toMatchObject([
      { productName: "Product 1", documentName: "Banner informasi", quantity: 3 },
      { productName: "Product 1", documentName: "Banner acara", quantity: 2 },
    ]);
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("ignores client document names for unchanged unnamed rows and newly added products", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [
      { id: "saved-a", productId: "p1", productName: "Product 1", documentName: null, quantity: 2, discount: 0 },
    ] }));
    const response = await PATCH(makeRequest("tx-1", { items: [
      line({ sourceItemId: "saved-a", documentName: "Injected old name" }),
      line({ productId: "p2", productName: "Product 2", documentName: "Injected new name" }),
    ] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data.items.create).toMatchObject([
      { productId: "p1", documentName: null }, { productId: "p2", documentName: null },
    ]);
  });

  it("preserves the document name of an unambiguous legacy row without a source ID", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [
      { id: "saved-a", productId: "p1", productName: "Product 1", documentName: "Banner kegiatan", quantity: 2, discount: 0 },
    ] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line()] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data.items.create).toMatchObject([{ documentName: "Banner kegiatan" }]);
  });

  it("refreshes document names under the parent lock to preserve a concurrent name save", async () => {
    const oldItem = { id: "saved-a", productId: "p1", productName: "Product 1", documentName: "Nama sebelum edit", quantity: 2, discount: 0 };
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [oldItem] }));
    transactionFindLockedMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [{ ...oldItem, documentName: "Nama baru yang tersimpan" }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-a", quantity: 3 })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data.items.create).toMatchObject([{ documentName: "Nama baru yang tersimpan", quantity: 3 }]);
    expect(transactionFindLockedMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "tx-1", storeId: "store-main" } }));
    const [sql, ...parameters] = transactionLockMock.mock.calls[0];
    expect(sql.join("?")).toMatch(/pos_transactions.*FOR UPDATE/s);
    expect(parameters).toEqual(["tx-1", "store-main"]);
    expect(transactionLockMock.mock.invocationCallOrder[0]).toBeLessThan(transactionFindLockedMock.mock.invocationCallOrder[0]);
  });

  it("rejects item edits when the draft is approved concurrently before acquiring the parent lock", async () => {
    const item = { id: "saved-a", productId: "p1", productName: "Product 1", documentName: "Nama dokumen", quantity: 2, discount: 0 };
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [item] }));
    transactionFindLockedMock.mockResolvedValue(existingTransaction({ status: "COMPLETED", items: [item] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-a" })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(409);
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("rejects replaced source rows instead of silently dropping their document names", async () => {
    const item = { id: "saved-a", productId: "p1", productName: "Product 1", documentName: "Nama dokumen", quantity: 2, discount: 0 };
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [item] }));
    transactionFindLockedMock.mockResolvedValue(existingTransaction({ status: "DRAFT", items: [{ ...item, id: "replacement" }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-a" })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(409);
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
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
  it.each(["DRAFT", "COMPLETED"])("preserves stored line discounts on %s metadata edits and ignores injected discounts", async status => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ status, discount: 100, items: [{ id: "saved-1", productId: "p1", productName: "Product 1", quantity: 2, discount: 500 }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-1", discount: 1999, subtotal: 1 })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 1500, total: 1400, items: { create: [{ discount: 500, subtotal: 1500 }] } });
  });

  it("caps a stored discount when the line quantity or price shrinks", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ items: [{ id: "saved-1", productId: "p1", quantity: 2, discount: 1500 }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-1", quantity: 1, appliedUnitPrice: 1000 })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 0, total: 0, items: { create: [{ discount: 1000, subtotal: 0 }] } });
  });

  it("keeps different discounts attached to their source rows when duplicate products reorder", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ items: [{ id: "a", productId: "p1", quantity: 2, discount: 500 }, { id: "b", productId: "p1", quantity: 2, discount: 100 }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "b" }), line({ sourceItemId: "a" })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data.items.create).toMatchObject([{ discount: 100, subtotal: 1900 }, { discount: 500, subtotal: 1500 }]);
  });

  it.each([
    [line({ sourceItemId: "a" }), line({ sourceItemId: "a" })],
    [line({ sourceItemId: "not-owned" })],
    [line({ sourceItemId: "a", productId: "another-product" })],
    [line(), line()],
  ])("rejects duplicate, invalid or ambiguous discount sources instead of cloning savings", async (...items) => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ items: [{ id: "a", productId: "p1", quantity: 2, discount: 500 }, { id: "b", productId: "p1", quantity: 2, discount: 100 }] }));
    const response = await PATCH(makeRequest("tx-1", { items }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(400);
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("preserves a unique legacy row but grants no injected discount to newly added products", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ items: [{ id: "saved-1", productId: "p1", quantity: 2, discount: 500 }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line(), line({ productId: "p2", discount: 5000 })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data.items.create).toMatchObject([{ discount: 500, subtotal: 1500 }, { discount: 0, subtotal: 2000 }]);
  });

  it.each([
    { taxRate: 10, taxMethod: "STANDARD", tax: 140, total: 1540 },
    { taxRate: null, taxMethod: "STANDARD", tax: 140, total: 1540 },
    { taxRate: 12, taxMethod: "DPP_NILAI_LAIN", tax: 154, total: 1554 },
  ])("keeps saved tax and payment state on metadata-only saves ($taxMethod, $taxRate)", async taxFields => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ ...taxFields, subtotal: 1500, discount: 100, amountPaid: 2000, change: 460, items: [{ id: "saved-1", productId: "p1", quantity: 2, discount: 500 }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-1" })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    const data = transactionUpdateMock.mock.calls[0][0].data;
    expect(data).toMatchObject({ subtotal: 1500, tax: taxFields.tax, total: taxFields.total });
    expect(data).not.toHaveProperty("amountPaid");
    expect(data).not.toHaveProperty("change");
    expect(data).not.toHaveProperty("status");
  });

  it("recomputes saved tax from the new net line subtotal after a quantity edit", async () => {
    transactionFindFirstMock.mockResolvedValue(existingTransaction({ subtotal: 1500, discount: 100, tax: 140, taxRate: 10, taxMethod: "STANDARD", items: [{ id: "saved-1", productId: "p1", quantity: 2, discount: 500 }] }));
    const response = await PATCH(makeRequest("tx-1", { items: [line({ sourceItemId: "saved-1", quantity: 3 })] }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 2500, tax: 240, total: 2640 });
  });

});
