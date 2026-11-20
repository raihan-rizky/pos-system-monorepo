import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), findMany: vi.fn(), count: vi.fn(), recognized: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { expense: { findMany: mocks.findMany, count: mocks.count } } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, requireRole: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: mocks.recognized }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET as summary } from "../summary/route";
import { GET as list } from "../route";

const oldPurchase = {
  id: "old", applicantName: "Pemasok", category: "SUPPLIES", customCategoryId: null, description: "Pembelian",
  amount: "100000.00", changeAmount: "0", occurredAt: new Date("2026-11-01T00:00:00.000Z"), createdAt: new Date("2026-11-01T00:00:00.000Z"),
  transactionId: null, attachmentUrl: null, manualPurchasePaymentMethod: null, hasMissingCostSnapshot: false,
  shoppingRequest: null, goodsPurchase: { id: "purchase", number: "PB-1" }, backdatedPurchaseDue: null,
  backdatedPurchasePayment: null, recordedBy: { id: "user", name: "Pengguna" },
};

describe("riwayat dan ringkasan pengeluaran yang diakui", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user", storeId: "store-1" });
    mocks.findMany.mockResolvedValue([oldPurchase]);
    mocks.count.mockResolvedValue(1);
    mocks.recognized.mockResolvedValue({ monthlyTotal: 0, incomplete: false, entryCount: 0, rows: [], daily: [], byCategory: [],
      components: { manual: 0, transfer: 0, giroPayment: 0, giroDue: 0, overpayment: 0 } });
  });

  it("tidak menampilkan pembelian pada bulan lama setelah jatuh tempo dipindah", async () => {
    const response = await list(new Request("http://localhost/api/finance/expenses?month=2026-11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  it("memakai jumlah dan komponen yang sama dengan proyeksi riwayat", async () => {
    mocks.recognized.mockResolvedValueOnce({ monthlyTotal: 30_000, incomplete: false, entryCount: 1, rows: [],
      daily: [{ date: "2026-11-10", total: 30_000, byCategory: { SUPPLIES: 30_000 } }],
      byCategory: [{ category: "SUPPLIES", total: 30_000 }],
      components: { manual: 0, transfer: 0, giroPayment: 30_000, giroDue: 0, overpayment: 0 } });
    const response = await summary(new Request("http://localhost/api/finance/expenses/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ monthlyTotal: 30_000, incomplete: false, entryCount: 1,
      components: { giroPayment: 30_000 }, byCategory: [{ category: "SUPPLIES", total: 30_000 }] });
  });

  it("memfilter kategori sebelum menghitung halaman riwayat", async () => {
    mocks.recognized.mockResolvedValueOnce({ incomplete: false, rows: [
      { id: "giro", category: "SUPPLIES", recognitionKind: "giro_payment" },
      { id: "rent", category: "RENT", recognitionKind: "manual" },
      { id: "due", category: "SUPPLIES", recognitionKind: "giro_due" },
    ] });
    const response = await list(new Request("http://localhost/api/finance/expenses?month=2026-11&category=SUPPLIES&limit=1&page=2"));
    const body = await response.json();
    expect(body.data).toMatchObject([{ id: "due", recognitionKind: "giro_due" }]);
    expect(body.pagination).toMatchObject({ total: 2, page: 2, totalPages: 2 });
  });
});
