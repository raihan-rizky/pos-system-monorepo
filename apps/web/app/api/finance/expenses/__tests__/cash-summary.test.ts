import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), recognized: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: mocks.recognized }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../summary/route";

describe("izin dan ringkasan pengeluaran", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.recognized.mockResolvedValue({ monthlyTotal: 45_000, incomplete: false, entryCount: 3,
      byCategory: [{ category: "SUPPLIES", total: 35_000 }, { category: "OTHER", total: 10_000 }],
      daily: [{ date: "2026-11-01", total: 10_000, byCategory: { OTHER: 10_000 } },
        { date: "2026-11-10", total: 35_000, byCategory: { SUPPLIES: 35_000 } }],
      components: { manual: 10_000, transfer: 5_000, giroPayment: 30_000, giroDue: 0, overpayment: 0 } });
  });

  it("memberikan ringkasan hanya dengan izin pengeluaran tanpa memuat pemasukan", async () => {
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ monthlyTotal: 45_000, incomplete: false, cashExpense: { total: 45_000, incomplete: false } });
    expect(body.cashDaily).toEqual([{ date: "2026-11-01", total: 10_000 }, { date: "2026-11-10", total: 35_000 }]);
    expect(body).not.toHaveProperty("income");
    expect(body).not.toHaveProperty("netCashFlow");
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("expense", "read");
  });

  it("memberikan metrik tanpa bagian tambahan ketika metricsOnly diminta", async () => {
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11&metricsOnly=1"));
    const body = await response.json();
    expect(body).toMatchObject({ month: "2026-11", monthlyTotal: 45_000, entryCount: 3 });
    expect(body).not.toHaveProperty("cashDaily");
    expect(body).not.toHaveProperty("cashExpense");
  });

  it("tidak menyajikan total parsial sebagai jumlah lengkap", async () => {
    mocks.recognized.mockResolvedValueOnce({ monthlyTotal: null, incomplete: true, entryCount: 1, byCategory: [],
      daily: [{ date: "2026-11-10", total: 30_000, byCategory: {} }],
      components: { manual: 0, transfer: 0, giroPayment: 30_000, giroDue: 0, overpayment: 0 } });
    const body = await (await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"))).json();
    expect(body.monthlyTotal).toBeNull();
    expect(body.cashExpense).toEqual({ total: null, incomplete: true });
    expect(body.cashDaily).toEqual([{ date: "2026-11-10", total: 30_000 }]);
  });

  it.each(["1899-12", "9999-01"])("menolak periode tidak tersedia %s", async month => {
    expect((await GET(new Request(`http://localhost/api/finance/expenses/summary?month=${month}&metricsOnly=1`))).status).not.toBe(200);
    expect(mocks.recognized).not.toHaveBeenCalled();
  });

  it("menolak akses tanpa izin sebelum membaca data", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    expect((await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"))).status).toBe(403);
    expect(mocks.recognized).not.toHaveBeenCalled();
  });

  it("menolak pengguna tanpa toko sebelum membaca data", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: null });
    expect((await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"))).status).toBe(403);
    expect(mocks.recognized).not.toHaveBeenCalled();
  });
});
