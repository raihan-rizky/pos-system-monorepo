import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), find: vi.fn(), update: vi.fn(), proof: vi.fn(), journal: vi.fn(), lock: vi.fn(), stock: vi.fn(), stockLocks: vi.fn(), products: vi.fn(), transaction: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/transactions-stock/services/transaction-reversal-service", () => ({ lockTransactionForStockMutation: mocks.lock }));
vi.mock("@/features/product-stock-groups/stock-mutations", () => ({ applyProductStockDelta: mocks.stock, StockMutationError: class extends Error {} }));
vi.mock("@/features/product-stock-groups/stock-group-lock", () => ({ lockStockMutationRows: mocks.stockLocks, isStockMutationConflict: () => false }));

const version = "2026-11-05T02:00:00.000Z";
const line = { id: "sj-item", transactionItemId: "line-1", productId: "paper", productName: "Kertas", quantity: 4, unit: "rim", keterangan: "", stockBefore: null, stockAfter: null, product: { id: "paper", stockGroupId: null, unitMultiplierToBase: 1 } };
function makeRecord(source = "TRANSACTION") {
  return { id: "sj-1", transactionId: "txn-1", storeId: "store-main", number: "SJ-001", status: "CONFIRMED", recipientName: "Pelanggan", updatedAt: new Date(version), items: [{ ...line }], transaction: { status: "COMPLETED", stockDeductionSource: source, items: [{ id: "line-1", productId: "paper", productName: "Kertas", quantity: 10 }], suratJalan: [{ id: "sj-1", status: "CONFIRMED", items: [{ ...line }] }, { id: "sj-2", status: "PENDING", items: [{ ...line, quantity: 3 }] }] } };
}
const changes = { expectedUpdatedAt: version, recipientName: "Gudang", quantities: { "line-1": 6 }, documentNames: { "line-1": "Kertas pesanan" }, keterangan: { "line-1": "Lantai 2" } };
async function request(body: unknown = changes) {
  const { PATCH } = await import("../route");
  return PATCH(new Request("http://localhost/api/surat-jalan/sj-1/document", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "sj-1" }) });
}

describe("PATCH surat jalan document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner", name: "Pemilik", storeId: "store-main", role: "OWNER" });
    mocks.authError.mockReturnValue(null);
    mocks.find.mockResolvedValue(makeRecord());
    mocks.lock.mockResolvedValue("COMPLETED");
    mocks.proof.mockResolvedValue([]);
    mocks.stock.mockResolvedValue({ productId: "paper", stockGroupId: null, beforeStock: 8, afterStock: 10, baseDelta: 2 });
    mocks.stockLocks.mockImplementation(async (_tx, input) => ({ lockedProductIds: input.productIds, lockedStockGroupIds: [...new Set(input.stockGroupIds)] }));
    mocks.products.mockResolvedValue([line.product]);
    mocks.update.mockImplementation(async ({ data }) => ({ ...makeRecord(), recipientName: data.recipientName, items: data.items.update.map((row: { where: { id: string }; data: object }) => ({ ...line, ...row.data, id: row.where.id })), updatedAt: new Date("2026-11-05T03:00:00.000Z") }));
    mocks.journal.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ suratJalan: { findFirst: mocks.find, update: mocks.update }, inventoryLog: { findMany: mocks.proof, createMany: mocks.journal }, product: { findMany: mocks.products } }));
  });

  it("saves quantity and snapshot names under the existing update permission without stock deduction", async () => {
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recipientName).toBe("Gudang");
    expect(body.items[0]).toMatchObject({ id: "sj-item", productId: "paper", transactionItemId: "line-1", quantity: 6, productName: "Kertas pesanan", keterangan: "Lantai 2" });
    expect(mocks.permission).toHaveBeenCalledWith("surat_jalan", "update");
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.journal).not.toHaveBeenCalled();
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sj-1", storeId: "store-main" } }));
  });

  it.each(["ADMIN", "CASHIER", "SALES"])("honors denied update permission for %s", async role => {
    const denied = new Error(`Denied ${role}`);
    mocks.permission.mockRejectedValue(denied);
    mocks.authError.mockImplementation(error => error === denied ? Response.json({ message: "Tidak memiliki izin" }, { status: 403 }) : null);
    expect((await request()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not reveal a document outside the active store", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a stale editor version before writing", async () => {
    const response = await request({ ...changes, expectedUpdatedAt: "2026-11-05T01:00:00.000Z" });
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/diubah|terbaru/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["VOIDED", "REFUNDED"])("rejects a parent transaction changed to %s", async status => {
    mocks.lock.mockResolvedValue(status);
    expect((await request()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("checks pending reservations again on the server", async () => {
    expect((await request({ ...changes, quantities: { "line-1": 8 } })).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([-1, "NaN", "Infinity"])("rejects malformed quantity %s", async quantity => {
    expect((await request({ ...changes, quantities: { "line-1": quantity } })).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reconciles a proven legacy reduction and records only the stock difference", async () => {
    mocks.find.mockResolvedValue(makeRecord("SURAT_JALAN"));
    mocks.proof.mockResolvedValue([{ productId: "paper", type: "OUT", quantity: 4, stockBaseDelta: -4, stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1 }]);
    expect((await request({ ...changes, quantities: { "line-1": 2 } })).status).toBe(200);
    expect(mocks.stock).toHaveBeenCalledWith(expect.anything(), { storeId: "store-main", productId: "paper", delta: 2 });
    expect(mocks.journal).toHaveBeenCalledWith({ data: [expect.objectContaining({ transactionId: "txn-1", suratJalanId: "sj-1", productId: "paper", type: "IN", reason: "SALE_RETURN", quantity: 2, stockBaseDelta: 2, unitMultiplierSnapshot: 1 })] });
  });

  it("rejects an unproven legacy quantity edit atomically", async () => {
    mocks.find.mockResolvedValue(makeRecord("SURAT_JALAN"));
    expect((await request()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it("returns grouped stock before deducting another unit and locks all affected rows first", async () => {
    const record = makeRecord("SURAT_JALAN");
    const loose = { ...line, productId: "a-loose", quantity: 1, product: { id: "a-loose", stockGroupId: "paper-group", unitMultiplierToBase: 1 } };
    const box = { ...line, id: "sj-box", transactionItemId: "line-box", productId: "z-box", quantity: 1, product: { id: "z-box", stockGroupId: "paper-group", unitMultiplierToBase: 5 } };
    mocks.find.mockResolvedValue({ ...record, items: [loose, box], transaction: { ...record.transaction, items: [{ id: "line-1", productId: "a-loose", productName: "Lembar", quantity: 10 }, { id: "line-box", productId: "z-box", productName: "Kotak", quantity: 2 }], suratJalan: [] } });
    mocks.products.mockResolvedValue([loose.product, box.product]);
    mocks.proof.mockResolvedValue([loose, box].map(item => ({ productId: item.productId, type: "OUT", quantity: 1, stockGroupIdSnapshot: "paper-group", unitMultiplierSnapshot: item.product.unitMultiplierToBase, stockBaseDelta: -item.product.unitMultiplierToBase })));
    let baseStock = 0;
    mocks.stock.mockImplementation(async (_tx, { productId, delta }) => {
      const baseDelta = delta * (productId === "z-box" ? 5 : 1);
      if (baseStock + baseDelta < 0) throw new Error("INSUFFICIENT_STOCK");
      baseStock += baseDelta;
      return { productId, stockGroupId: "paper-group", baseDelta };
    });
    const response = await request({ ...changes, quantities: { "line-1": 4, "line-box": 0 } });
    expect(response.status).toBe(200);
    expect(baseStock).toBe(2);
    expect(mocks.stockLocks).toHaveBeenCalledWith(expect.anything(), { storeId: "store-main", stockGroupIds: ["paper-group", "paper-group"], productIds: ["a-loose", "z-box"] });
    expect(mocks.stockLocks.mock.invocationCallOrder[0]).toBeLessThan(mocks.stock.mock.invocationCallOrder[0]);
    expect(mocks.journal).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ productId: "z-box", stockBaseDelta: 5 }), expect.objectContaining({ productId: "a-loose", stockBaseDelta: -3 })]) });
  });
});
