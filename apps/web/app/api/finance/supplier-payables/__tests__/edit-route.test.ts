import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../[id]/route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), page: vi.fn(), query: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, authorizeInTransaction: async (_tx: unknown, _actor: unknown, requirements: { resources: { resource: string; action: string }[] }) => { try { for (const grant of requirements.resources) await mocks.permission(grant.resource, grant.action); return true; } catch { return false; } }, canAuthenticatedUserAccessPage: mocks.page,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "forbidden" ? new Response(null, { status: 403 }) : null }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/keuangan/services/manual-payable-reconciliation", async original => ({ ...await original<object>(), reconcilePayable: mocks.reconcile }));

const input = { supplierName: "Pemasok", amount: "1000", debtDate: "2026-10-01", dueDate: "2026-11-01", note: "Tagihan", reportCategory: "ATK" };
const expected = { ...input, amount: 1000 };
const context = { params: Promise.resolve({ id: "debt-1" }) };
const request = (value: unknown = input) => new Request("http://localhost/api/finance/supplier-payables/debt-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected, ...(value as object) }) });

describe("koreksi rincian hutang manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.permission.mockResolvedValue({ id: "owner-1", storeId: "store-1" });
    mocks.page.mockResolvedValue(true);
    mocks.query.mockResolvedValue([{ id: "debt-1", ...expected, amount: "1000" }]);
    mocks.findMany.mockResolvedValue([{ amount: "400", paidAt: new Date("2026-10-05T00:00:00Z"), origin: "MANUAL" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.reconcile.mockResolvedValue({});
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, supplierPayablePayment: { findMany: mocks.findMany }, supplierPayable: { updateMany: mocks.updateMany } }));
  });

  it("memperbarui seluruh rincian dan merekonsiliasi dalam transaksi yang sama", async () => {
    const response = await PATCH(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable", "read");
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable.manual", "update");
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain('"goodsPurchaseId" IS NULL');
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain("FOR UPDATE");
    expect(mocks.query.mock.calls[0]).toContain("store-1");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ supplierName: "Pemasok", amount: 1000, reportCategory: "ATK", note: "Tagihan" }) }));
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ storeId: "store-1", payableId: "debt-1", actorId: "owner-1" }));
  });

  it("menolak pengguna tanpa izin khusus sebelum menyentuh data", async () => {
    mocks.permission.mockImplementation(async (target: string) => { if (target === "expense.payable.manual") throw new Error("forbidden"); return { id: "user-1", storeId: "store-1" }; });
    expect((await PATCH(request(), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("menolak koreksi tanpa akses halaman Keuangan", async () => {
    mocks.page.mockResolvedValue(false);
    expect((await PATCH(request(), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("menolak nominal kurang dari pembayaran dan tanggal setelah pembayaran", async () => {
    expect((await PATCH(request({ ...input, amount: "399.99" }), context)).status).toBe(409);
    expect((await PATCH(request({ ...input, debtDate: "2026-10-06" }), context)).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("menolak kategori kosong dan hutang dari toko lain", async () => {
    expect((await PATCH(request({ ...input, reportCategory: "" }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([]);
    expect((await PATCH(request(), context)).status).toBe(404);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("menolak formulir lama jika nominal hutang telah diubah orang lain", async () => {
    mocks.query.mockResolvedValueOnce([{ id: "debt-1", ...expected, amount: "2000" }]);
    expect((await PATCH(request(), context)).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("memerlukan izin koreksi pembayaran bila jatuh tempo yang diubah menghapus pelunasan otomatis", async () => {
    const denied = new Error("forbidden");
    mocks.permission.mockImplementation(async (target: string) => {
      if (target === "expense.payable.manual.payment") throw denied;
      return { id: "owner-1", storeId: "store-1" };
    });
    expect((await PATCH(request({ ...input, dueDate: "2099-11-01" }), context)).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
