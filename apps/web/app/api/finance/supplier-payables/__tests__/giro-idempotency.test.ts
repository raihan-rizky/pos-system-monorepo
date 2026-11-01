import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { POST } from "../[id]/payments/route";

const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
const context = { params: Promise.resolve({ id: "debt-1" }) };
const debt = { amount: "1000.00", debtDate: "2026-10-01", goodsPurchaseId: "purchase-1", giroHistoryVerifiedAt: new Date("2026-10-05T00:00:00Z") };
const request = (amount: string, requestKey: string | null = key) => new Request("http://localhost/api/finance/supplier-payables/debt-1/payments", {
  method: "POST", headers: { "Content-Type": "application/json", ...(requestKey ? { "Idempotency-Key": requestKey } : {}) },
  body: JSON.stringify({ amount, paidAt: "2026-10-10", expectedBalance: "1000" }),
});

describe("idempotensi pembayaran giro", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
  });

  it("memerlukan kunci untuk pembayaran giro", async () => {
    mocks.query.mockResolvedValueOnce([debt]);
    expect((await POST(request("300", null), context)).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("mengembalikan keberhasilan untuk retry yang sama meski hutang sudah lunas", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: "debt-1", amount: "1000.00", paidAt: "2026-10-10", requestExpectedBalance: "1000.00" }]);
    expect((await POST(request("1000"), context)).status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("menolak kunci sama yang dipakai untuk jumlah berbeda", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: "debt-1", amount: "300.00", paidAt: "2026-10-10", requestExpectedBalance: "1000.00" }]);
    expect((await POST(request("400"), context)).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("menolak kunci sama yang dipakai pada hutang lain tanpa mencatat pembayaran", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: "debt-2", amount: "300.00", paidAt: "2026-10-10", requestExpectedBalance: "1000.00" }]);
    expect((await POST(request("300"), context)).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("membatasi cakupan kunci pada toko pengguna", async () => {
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: "debt-1", amount: "300.00", paidAt: "2026-10-10", requestExpectedBalance: "1000.00" }]);
    await POST(request("300"), context);
    expect(mocks.query.mock.calls[1]).toContain(JSON.stringify(["store-1", key]));
  });
});
