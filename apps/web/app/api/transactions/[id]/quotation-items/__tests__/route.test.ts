import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), find: vi.fn(), lock: vi.fn(),
  findProducts: vi.fn(), create: vi.fn(), update: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@pos/db", () => ({ db: { transaction: { findFirst: mocks.find }, $transaction: mocks.transaction } }));

const context = { params: Promise.resolve({ id: "draft-1" }) };
const manual = { id: "a70cb8d3-fc1a-4772-9d66-123b4d79b094", name: "Barang manual", quantity: 2, unit: "dus", unitPrice: 1250, productId: null };
const linked = { ...manual, id: "945cac32-4fd0-49d7-badb-f22dbbd4b9b4", name: "Nama pilihan pengguna", quantity: 3, unitPrice: 1000, productId: "p-1" };
const base = { id: "draft-1", status: "DRAFT", subtotal: 10000, discount: 0, taxRate: 10, taxMethod: "DPP_NILAI_LAIN", tax: 917, total: 10917, amountPaid: 0, change: 0, paymentMethod: "CASH" };
const send = (items: unknown) => new Request("http://localhost/draft-1/quotation-items", { method: "POST", body: JSON.stringify({ items }) });

describe("quotation items", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ storeId: "store-1", role: "CASHIER" });
    mocks.find.mockResolvedValue({ ...base, items: [] });
    mocks.findProducts.mockResolvedValue([{ id: "p-1", name: "Produk katalog", unit: "pak", costPrice: 400 }]);
    mocks.transaction.mockImplementation(callback => callback({
      $queryRaw: mocks.lock, transaction: { findFirst: mocks.find, update: mocks.update },
      product: { findMany: mocks.findProducts }, transactionItem: { createMany: mocks.create },
    }));
    mocks.update.mockImplementation(({ data }) => ({ ...base, ...data }));
  });

  it("saves typed names with optional catalog links and updates the quote totals", async () => {
    const { POST } = await import("../route");
    const response = await POST(send([manual, linked]), context);
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("transaction.draft", "update");
    expect(mocks.permission).toHaveBeenCalledWith("product", "read");
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.find.mock.invocationCallOrder[0]);
    expect(mocks.create).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ id: manual.id, transactionId: base.id, productId: null, productName: manual.name, quotationUnit: "dus", subtotal: 2500 }),
      expect.objectContaining({ id: linked.id, transactionId: base.id, productId: "p-1", productName: "Produk katalog", documentName: linked.name, quotationUnit: "pak", subtotal: 3000 }),
    ] });
    const result = await response.json();
    expect(result.tax.transaction).toMatchObject({ subtotal: 15500, tax: 1421, total: 16921 });
  });

  it("keeps retries from adding the same amount twice", async () => {
    const { POST } = await import("../route");
    mocks.find.mockResolvedValue({ ...base, subtotal: 12500, items: [{ id: manual.id, productId: null, productName: manual.name, documentName: manual.name, quotationUnit: manual.unit, quantity: manual.quantity, unitPrice: manual.unitPrice, subtotal: 2500 }] });
    expect((await POST(send([manual]), context)).status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects links outside the current store or inactive catalog", async () => {
    const { POST } = await import("../route");
    mocks.findProducts.mockResolvedValue([]);
    expect((await POST(send([linked]), context)).status).toBe(422);
    expect(mocks.findProducts).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["p-1"] }, storeId: "store-1", isActive: true } }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("checks draft update permission before accepting submitted rows", async () => {
    const { POST } = await import("../route");
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    expect((await POST(send([manual]), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
