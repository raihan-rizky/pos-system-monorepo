import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../[id]/payments/[paymentId]/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), page: vi.fn(), query: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, authorizeInTransaction: async () => true, canAuthenticatedUserAccessPage: mocks.page,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "forbidden" ? new Response(null, { status: 403 }) : null }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/keuangan/services/manual-payable-reconciliation", async original => ({ ...await original<object>(), reconcilePayable: mocks.reconcile }));

const debt = { id: "debt-1", amount: "1000", debtDate: "2026-10-01" };
const payment = { id: "p1", amount: "400", paidAt: new Date("2026-10-05T00:00:00Z"), origin: "MANUAL", transferAllocation: null };
const context = (paymentId = "p1") => ({ params: Promise.resolve({ id: "debt-1", paymentId }) });
const request = (value: unknown = { amount: "300", paidAt: "2026-10-06" }) => new Request("http://localhost/api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected: { amount: 400, paidAt: "2026-10-05", origin: "MANUAL" }, ...(value as object) }) });

describe("koreksi pembayaran hutang manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner-1", storeId: "store-1" });
    mocks.page.mockResolvedValue(true);
    mocks.query.mockResolvedValue([debt]);
    mocks.findMany.mockResolvedValue([payment]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.reconcile.mockResolvedValue({ automaticPaymentId: "auto-saved" });
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, supplierPayablePayment: { findMany: mocks.findMany, updateMany: mocks.updateMany } }));
  });

  it("memperbarui nominal dan tanggal lalu merekonsiliasi hutang dalam satu transaksi", async () => {
    expect((await PATCH(request(), context())).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable", "read");
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable.manual.payment", "update");
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain('"goodsPurchaseId" IS NULL');
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain("FOR UPDATE");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", payableId: "debt-1" }, data: expect.objectContaining({ amount: 300, paidAt: new Date("2026-10-06T00:00:00Z") }) }));
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it("memerlukan izin khusus sebelum membuka transaksi", async () => {
    mocks.permission.mockImplementation(async (target: string) => { if (target === "expense.payable.manual.payment") throw new Error("forbidden"); return { id: "user-1", storeId: "store-1" }; });
    expect((await PATCH(request(), context())).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("menolak koreksi pembayaran tanpa akses halaman Keuangan", async () => {
    mocks.page.mockResolvedValue(false);
    expect((await PATCH(request(), context())).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("menolak perubahan yang melampaui hutang atau tidak sesuai tanggal hutang", async () => {
    expect((await PATCH(request({ amount: "1000.01", paidAt: "2026-10-06" }), context())).status).toBe(409);
    expect((await PATCH(request({ amount: "10", paidAt: "2026-09-30" }), context())).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("melindungi nominal dan tanggal transfer yang telah dialokasikan", async () => {
    mocks.findMany.mockResolvedValue([{ ...payment, transferAllocation: { amount: "250", expense: { occurredAt: new Date("2026-10-04T17:00:00Z") } } }]);
    expect((await PATCH(request({ amount: "249", paidAt: "2026-10-05" }), context())).status).toBe(409);
    expect((await PATCH(request({ amount: "400", paidAt: "2026-10-06" }), context())).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("menyimpan koreksi pelunasan otomatis dengan identitas pembayaran yang tersimpan", async () => {
    mocks.findMany.mockResolvedValue([{ ...payment, id: "auto-saved", origin: "AUTO" }]);
    expect((await PATCH(request({ amount: "300", paidAt: "2026-10-06", expected: { amount: 400, paidAt: "2026-10-05", origin: "AUTO" } }), context("auto:debt-1"))).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "auto-saved", payableId: "debt-1" }, data: expect.objectContaining({ origin: "CORRECTED_AUTO", automaticKey: null }) }));
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
  });
  it("menolak koreksi dari riwayat pembayaran yang sudah berubah", async () => {
    mocks.findMany.mockResolvedValue([{ ...payment, amount: "500" }]);
    expect((await PATCH(request(), context())).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
