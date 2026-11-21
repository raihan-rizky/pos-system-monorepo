import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), permission: vi.fn(), reconcile: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => ({ id: "user-1", storeId: "store-1", role: "OWNER" }),
  requirePermission: mocks.permission, authorizeInTransaction: async () => true, canAuthenticatedUserAccessPage: async () => true, handleAuthError: () => null }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/keuangan/services/manual-payable-reconciliation", async original => ({ ...await original<object>(), reconcilePayable: mocks.reconcile }));
import { POST } from "../[id]/payments/route";

const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
const debt = { amount: "1000", debtDate: "2026-01-01", dueDate: null, goodsPurchaseId: null, ledgerVersion: "0" };
const context = { params: Promise.resolve({ id: "debt-1" }) };
const request = (amount = "300", requestKey: string | null = key, expectedBalance = "1000", expectedLedgerVersion?: string) => new Request("http://localhost/payments", {
  method: "POST", headers: { "Content-Type": "application/json", ...(requestKey ? { "Idempotency-Key": requestKey } : {}) },
  body: JSON.stringify({ amount, paidAt: "2026-01-10", expectedBalance, expectedLedgerVersion }),
});
describe("idempotensi pembayaran hutang manual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1", role: "OWNER" });
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(' ');
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM "pos_payable_payment_attempts"')) return Promise.resolve([]);
      return mocks.query(parts, ...values);
    }, $executeRaw: mocks.execute }));
    mocks.reconcile.mockResolvedValue({});
  });
  it("menolak penyimpanan tanpa kunci", async () => {
    mocks.query.mockResolvedValueOnce([debt]);
    expect((await POST(request("300", null), context)).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("mengembalikan keberhasilan tanpa menyimpan ulang setelah respons hilang", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: "user-1", payableId: "debt-1", amount: "300", paidAt: "2026-01-10", requestExpectedBalance: "1000" }]);
    expect((await POST(request(), context)).status).toBe(201);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("mengakui request asli setelah nominal dan tanggal pembayaran dikoreksi", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: "user-1", payableId: "debt-1", amount: "400", paidAt: "2026-01-11", requestAmount: "300", requestPaidAt: "2026-01-10", requestExpectedBalance: "1000" }]);
    expect((await POST(request(), context)).status).toBe(201);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("menolak kunci yang sama untuk nominal berbeda", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: "user-1", payableId: "debt-1", amount: "300", paidAt: "2026-01-10", requestExpectedBalance: "1000" }]);
    expect((await POST(request("400"), context)).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("menolak saldo lama dari tab lain", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: "300", corrected: false, purchaseMethod: null }]);
    const response = await POST(request("300", key, "1000", "0"), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("BalanceChanged");
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalled();
  });
});
