import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), can: vi.fn(), receipt: vi.fn(), lock: vi.fn(), link: vi.fn(),
  findTransaction: vi.fn(), create: vi.fn(), products: vi.fn(), stock: vi.fn(),
  journal: vi.fn(), transaction: vi.fn(), customer: vi.fn(), salesperson: vi.fn(),
  stockLock: vi.fn(), customerUpdate: vi.fn(),
}));

vi.mock("next/server", async () => ({ ...await vi.importActual<typeof import("next/server")>("next/server"), after: vi.fn() }));
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: async () => ({ enabled: false, increment: 500, threshold: 50 }) }));
vi.mock("@/features/customer-category-pricing/server/special-pricing-settings", () => ({ getSpecialPricingEnabled: async () => false }));
vi.mock("@/lib/rbac/guard", () => {
  class AuthError extends Error { constructor(readonly status: number, message: string) { super(message); } }
  return { requireRole: mocks.role, requirePermission: vi.fn(), handleAuthError: (error: unknown) => error instanceof AuthError ? Response.json({ message: error.message }, { status: error.status }) : null, AuthError };
});
vi.mock("@/features/rbac/helpers/rbac-core", () => ({ canRolePerformAction: mocks.can }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: async () => [] }));
vi.mock("@/lib/push-events", () => ({ sendRolePushEvent: vi.fn() }));
vi.mock("@/features/invoice-date/services/internet-clock", () => ({ getInvoiceNow: async () => new Date("2026-10-20T03:00:00Z") }));
vi.mock("@/features/customer-category-pricing/helpers/base-cost", () => ({ loadProductBaseCosts: async () => new Map() }));
vi.mock("@/features/product-stock-groups/stock-mutations", () => ({ applyProductStockDeltas: mocks.stock, StockMutationError: class extends Error {} }));
vi.mock("@pos/db", () => ({ Prisma: {}, db: {
  printingReceipt: { findFirst: mocks.receipt }, product: { findMany: mocks.products },
  customer: { findFirst: mocks.customer }, salesperson: { findFirst: mocks.salesperson },
  printingService: { findMany: vi.fn(async () => []) },
  transaction: { count: async () => 0, findFirst: mocks.findTransaction },
  categoryCustomerPricingRule: { findMany: async () => [] }, $transaction: mocks.transaction,
} }));

const document = () => ({
  customerName: "Pelanggan Lama", customerPhone: "", customerId: null, date: "2026-10-20",
  note: "", completionDate: "", completionTime: "", receiver: "Penerima Lama", setter: "Seting",
  signatory: "Nama Manual", lines: [{ id: "baris", name: "Spanduk", material: "", quantity: 1, price: 50000, stockLink: null }],
});
const receipt = () => ({ id: "receipt-1", storeId: "store-1", subcategory: "SPANDUK", number: "SP-01", revision: 3, document: document(), transactionId: null });
const selection = { customerName: "Pelanggan Baru", customerId: "customer-1" };

async function checkout(overrides: Record<string, unknown> = {}) {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
    printingReceiptId: "receipt-1", printingReceiptRevision: 3, printingReceiptCheckout: selection,
    customerName: selection.customerName, customerId: selection.customerId, salesName: "Nama Klien", salespersonId: "sales-1",
    items: [], paymentMethod: "CASH", amountPaid: 50000, ...overrides,
  }) }));
}

beforeAll(async () => { await import("../route"); }, 30000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ id: "cashier-1", role: "CASHIER", storeId: "store-1", name: "Kasir" });
  mocks.can.mockImplementation((_role, _resource, action) => action === "create" || action === "update");
  mocks.receipt.mockResolvedValue(receipt());
  mocks.customer.mockResolvedValue({ id: "customer-1", type: "UMUM" });
  mocks.salesperson.mockResolvedValue({ id: "sales-1", name: "Sales Tersimpan" });
  mocks.products.mockResolvedValue([]);
  mocks.lock.mockResolvedValue({ count: 1 });
  mocks.link.mockResolvedValue({});
  mocks.stock.mockResolvedValue([]);
  mocks.journal.mockResolvedValue({ count: 0 });
  mocks.findTransaction.mockResolvedValue(null);
  mocks.customerUpdate.mockResolvedValue({});
  mocks.stockLock.mockImplementation(async (_strings: TemplateStringsArray, id: string) => [{ id }]);
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "transaction-1", ...data, items: [], payments: [] }));
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    printingReceipt: { updateMany: mocks.lock, update: mocks.link, findFirst: mocks.receipt },
    transaction: { create: mocks.create, findFirst: mocks.findTransaction },
    inventoryLog: { createMany: mocks.journal }, customer: { update: mocks.customerUpdate },
    product: { findMany: mocks.products }, $queryRaw: mocks.stockLock,
  }));
});

describe("nama nota disimpan bersama checkout", () => {
  it("menolak checkout tanpa izin create sebelum mengubah nota", async () => {
    mocks.can.mockReturnValue(false);
    expect((await checkout()).status).toBe(403);
    expect(mocks.receipt).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it.each(["CASHIER", "SALES"])("memakai izin create %s dan menyimpan pilihan dalam transaksi yang sama", async role => {
    mocks.role.mockResolvedValue({ id: "cashier-1", role, storeId: "store-1", name: "Kasir" });
    mocks.can.mockImplementation((_role, resource, action) => action === "create" && resource === (role === "SALES" ? "transaction.request" : "transaction"));
    const response = await checkout();
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerName: "Pelanggan Baru", customerId: "customer-1", salesName: "Sales Tersimpan" }) }));
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ transactionId: "transaction-1", document: expect.objectContaining({ customerName: "Pelanggan Baru", customerId: "customer-1", receiver: "Pelanggan Baru", signatory: "Sales Tersimpan", setter: "Seting" }) }) }));
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("mempertahankan nama manual jika tidak ada sales terpilih", async () => {
    expect((await checkout({ salesName: "", salespersonId: "" })).status).toBe(201);
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ document: expect.objectContaining({ signatory: "Nama Manual" }) }) }));
  });

  it("mempertahankan pelanggan tersimpan untuk klien lama tanpa pilihan checkout eksplisit", async () => {
    const response = await checkout({ printingReceiptCheckout: undefined, customerName: "Nama Palsu", customerId: "customer-lain", salesName: "", salespersonId: "" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerName: "Pelanggan Lama", customerId: null }) }));
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ document: expect.objectContaining({ customerName: "Pelanggan Lama", receiver: "Pelanggan Lama", signatory: "Nama Manual" }) }) }));
  });

  it("mempertahankan nama sales manual pada transaksi dari klien lama", async () => {
    const response = await checkout({ printingReceiptCheckout: undefined, salesName: "Sales Manual", salespersonId: "" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salesName: "Sales Manual" }) }));
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ document: expect.objectContaining({ signatory: "Nama Manual" }) }) }));
  });

  it("memakai nama sales terdaftar pada transaksi dan nota klien lama saat ID sales tersedia", async () => {
    const response = await checkout({ printingReceiptCheckout: undefined, salesName: "Nama Palsu" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salesName: "Sales Tersimpan" }) }));
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ document: expect.objectContaining({ signatory: "Sales Tersimpan" }) }) }));
  });

  it("menolak pelanggan dari toko lain sebelum mengubah nota", async () => {
    mocks.customer.mockResolvedValue(null);
    expect((await checkout()).status).toBe(404);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("menolak sales dari toko lain sebelum mengubah nota", async () => {
    mocks.salesperson.mockResolvedValue(null);
    expect((await checkout()).status).toBe(404);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("menolak data pilihan pelanggan yang tidak valid", async () => {
    expect((await checkout({ printingReceiptCheckout: { customerName: "P".repeat(201), customerId: null } })).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("menolak nama sales yang tidak dapat disimpan dalam dokumen sebelum membuat transaksi", async () => {
    mocks.salesperson.mockResolvedValue({ id: "sales-1", name: "S".repeat(201) });
    expect((await checkout()).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("tidak mengubah nama ketika pembayaran tidak cukup", async () => {
    expect((await checkout({ amountPaid: 1 })).status).toBe(422);
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("menyimpan tanggal nota pilihan Owner bersama transaksi", async () => {
    mocks.role.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-1", name: "Owner" });
    const response = await checkout({ invoiceDate: "2026-10-19", invoiceDateReason: "Sesuai nota" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invoiceDate: new Date("2026-10-19T03:00:00Z") }) }));
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ document: expect.objectContaining({ date: "2026-10-19" }) }) }));
  });

  it("pengulangan setelah transaksi tercatat mengembalikan transaksi awal tanpa memperbarui nama", async () => {
    const original = { id: "transaction-1", customerName: "Pelanggan Pertama", salesName: "Sales Pertama", items: [] };
    mocks.receipt.mockResolvedValue({ ...receipt(), transactionId: original.id });
    mocks.findTransaction.mockResolvedValue(original);
    const response = await checkout({ printingReceiptCheckout: { customerName: "Pelanggan Kedua", customerId: null }, salesName: "Sales Kedua" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(original);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
