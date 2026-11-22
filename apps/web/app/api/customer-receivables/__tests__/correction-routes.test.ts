import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as editDebt } from "../[id]/route";
import { PATCH as editPayment } from "../[id]/payments/[paymentId]/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), transactionPermission: vi.fn(), page: vi.fn(), transaction: vi.fn(), correctDebt: vi.fn(), correctPayment: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: mocks.page,
  authorizeInTransaction: mocks.transactionPermission,
  AuthError: class AuthError extends Error { constructor(public status: number, message: string) { super(message); } },
  handleAuthError: (error: unknown) => error instanceof Error && (error.message === "forbidden" || ("status" in error && error.status === 403)) ? new Response(null, { status: 403 }) : null }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/customer-debt/services/manual-receivable-correction", async original => ({ ...await original<object>(), correctReceivable: mocks.correctDebt, correctReceivablePayment: mocks.correctPayment }));
const debt = { amount: 1000, debtDate: "2026-10-01", dueDate: "2026-11-01", reportCategory: "ATK", note: "Catatan", expectedUpdatedAt: "2026-10-05T04:00:00.000Z" };
const payment = { amount: 500, method: "TRANSFER", paidAt: "2026-10-05", note: "Cicilan", expectedUpdatedAt: "2026-10-05T04:00:00.000Z" };
const request = (body: unknown) => new Request("http://localhost/api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("API koreksi piutang manual", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "owner-1", storeId: "store-1" }); mocks.page.mockResolvedValue(true);
    mocks.transactionPermission.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async callback => callback("tx")); mocks.correctDebt.mockResolvedValue(undefined); mocks.correctPayment.mockResolvedValue(undefined);
  });
  it("membatasi edit rincian dan pembayaran dengan izin masing-masing", async () => {
    expect((await editDebt(request(debt), { params: Promise.resolve({ id: "r1" }) })).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("customer.receivable.manual", "update");
    expect(mocks.correctDebt).toHaveBeenCalledWith("tx", "r1", debt, { id: "owner-1", storeId: "store-1" }, expect.any(Function));
    expect((await editPayment(request(payment), { params: Promise.resolve({ id: "r1", paymentId: "p1" }) })).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("customer.receivable.manual.payment", "update");
    expect(mocks.correctPayment).toHaveBeenCalledWith("tx", "r1", "p1", payment, { id: "owner-1", storeId: "store-1" });
  });
  it("rechecks both correction grants within the write transaction", async () => {
    mocks.transactionPermission.mockResolvedValue(false);

    expect((await editDebt(request(debt), { params: Promise.resolve({ id: "r1" }) })).status).toBe(403);
    expect((await editPayment(request(payment), { params: Promise.resolve({ id: "r1", paymentId: "p1" }) })).status).toBe(403);
    expect(mocks.correctDebt).not.toHaveBeenCalled();
    expect(mocks.correctPayment).not.toHaveBeenCalled();
  });
  it("memeriksa customer.read di dalam transaksi hanya saat pelanggan berubah", async () => {
    mocks.correctDebt.mockImplementation(async (_tx, _id, input, _actor, authorize) => {
      if (input.customerId === "c2") await authorize();
    });
    mocks.transactionPermission.mockImplementation(async (_tx, _actor, requirements: { resources: { resource: string }[] }) => {
      return !requirements.resources.some(({ resource }) => resource === "customer");
    });
    expect((await editDebt(request({ ...debt, customerId: "c1" }), { params: Promise.resolve({ id: "r1" }) })).status).toBe(200);
    expect((await editDebt(request({ ...debt, customerId: "c2" }), { params: Promise.resolve({ id: "r1" }) })).status).toBe(403);
    mocks.transactionPermission.mockResolvedValue(true);
    expect((await editDebt(request({ ...debt, customerId: "c2" }), { params: Promise.resolve({ id: "r1" }) })).status).toBe(200);
  });
  it("menolak pengguna tanpa izin dan tidak memulai transaksi", async () => {
    mocks.permission.mockImplementation(async (target: string) => { if (target === "customer.receivable.manual" || target === "customer.receivable.manual.payment") throw new Error("forbidden"); return { id: "user-1", storeId: "store-1" }; });
    expect((await editDebt(request(debt), { params: Promise.resolve({ id: "r1" }) })).status).toBe(403);
    expect((await editPayment(request(payment), { params: Promise.resolve({ id: "r1", paymentId: "p1" }) })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("menolak kategori dan tanggal pembayaran yang tidak valid", async () => {
    expect((await editDebt(request({ ...debt, reportCategory: "" }), { params: Promise.resolve({ id: "r1" }) })).status).toBe(422);
    expect((await editPayment(request({ ...payment, paidAt: "2099-01-01" }), { params: Promise.resolve({ id: "r1", paymentId: "p1" }) })).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
