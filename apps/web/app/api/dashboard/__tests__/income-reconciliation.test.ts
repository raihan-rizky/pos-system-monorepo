import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), manual: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@/features/customer-debt/services/receivable-balance", () => ({ loadReceivableBalance: async () => 0 }));
vi.mock("@pos/db", () => ({ db: {
  transaction: { findMany: mocks.transactions, groupBy: async () => [], aggregate: async () => ({ _sum: { total: 100_000, amountPaid: 25_000 } }) },
  manualIncome: { findMany: mocks.manual }, transactionItem: { groupBy: async () => [] },
  product: { count: async () => 0, findMany: async () => [] }, $queryRaw: async () => [],
} }));
import { GET } from "../route";

const oldInvoice = {
  id: "old-invoice", createdAt: new Date("2026-11-09T03:00:00Z"), invoiceDate: new Date("2026-11-09T03:00:00Z"),
  status: "COMPLETED", total: 100_000, amountPaid: 100_000, change: 0, paymentMethod: "CASH",
  transactionCategory: "ATK", printingSubcategory: null,
  items: [{ subtotal: 100_000, quantity: 1, unitCost: 30_000 }],
  payments: [{ id: "p", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
  debtPaymentLogs: [{ id: "d", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
};
const dp = { ...oldInvoice, id: "dp", status: "DP", total: 100_000, amountPaid: 25_000, payments: [{ id: "dp-payment", method: "CASH", amount: 25_000, createdAt: new Date("2026-11-09T03:00:00Z") }], debtPaymentLogs: [] };
const originalTimezone = process.env.TZ;

describe("Dashboard berdasarkan penerimaan Sales", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transactions.mockImplementation(async query => query.select?.payments ? [oldInvoice, dp] : query.select?.invoiceDate ? [oldInvoice, dp] : []);
    mocks.manual.mockResolvedValue([{ id: "manual", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000, payments: [{ method: "CASH", amount: 10_000 }, { method: "TRANSFER", amount: 10_000 }] }]);
  });
  afterEach(() => { vi.useRealTimers(); if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; });

  it("menyamakan total, metode dan Outstanding DP dengan penerimaan harian", async () => {
    const body = await (await GET()).json();
    expect(body.todayRevenue).toBe(80_000);
    expect(body.monthlyRevenue).toBe(145_000);
    expect(body.revenueChart.find((row: { date: string }) => row.date === "2026-11-11").revenue).toBe(80_000);
    expect(body.paymentMixToday).toEqual(expect.arrayContaining([{ method: "CASH", revenue: 10_000, transactionCount: 0 }, { method: "TRANSFER", revenue: 70_000, transactionCount: 0 }]));
    expect(body.totalOutstandingDP).toBe(75_000);
    expect(body.todayProfit).toBe(0);
    expect(body.monthlyProfit).toBe(140_000);
  });

  it("tidak membuka nominal periode atau rincian metode untuk izin total harian saja", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources.income.read = false;
    permissions.SALES.resources["financial-report"].read = false;
    permissions.SALES.resources["financial-report.daily-payment-method"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    const body = await (await GET()).json();
    expect(body.todayRevenue).toBe(80_000);
    expect(body.monthlyRevenue).toBeNull();
    expect(body.paymentMixToday).toBeNull();
    expect(body.revenueChart.every((row: { revenue: number | null }) => row.revenue === null)).toBe(true);
  });

  it("menutup nominal sensitif ketika izin gagal diperiksa", async () => {
    mocks.permissions.mockRejectedValue(new Error("unavailable"));
    const body = await (await GET()).json();
    expect(body.todayRevenue).toBeNull();
    expect(body.monthlyRevenue).toBeNull();
    expect(body.paymentMixToday).toBeNull();
  });

  it("memakai batas tengah malam WIB pada server yang memakai UTC", async () => {
    process.env.TZ = "UTC";
    const early = { ...oldInvoice, createdAt: new Date("2026-11-10T23:00:00Z"), invoiceDate: new Date("2026-11-10T23:00:00Z"), payments: [{ id: "early", method: "CASH", amount: 100_000, createdAt: new Date("2026-11-10T23:00:00Z") }], debtPaymentLogs: [] };
    mocks.transactions.mockImplementation(async query => query.select?.payments || query.select?.invoiceDate ? [early] : []);
    mocks.manual.mockResolvedValue([]);
    const body = await (await GET()).json();
    expect(body.todayRevenue).toBe(100_000);
    expect(body.revenueChart.find((row: { date: string }) => row.date === "2026-11-11").revenue).toBe(100_000);
  });

  it("menghitung pembayaran hari ini untuk faktur bertanggal mendatang, tetapi bukan pembayaran mendatang", async () => {
    const futureInvoice = { ...oldInvoice, invoiceDate: new Date("2026-12-01T03:00:00Z"), payments: [{ id: "paid-now", method: "CASH", amount: 100_000, createdAt: new Date("2026-11-11T03:00:00Z") }], debtPaymentLogs: [] };
    const futurePayment = { ...dp, id: "future-payment", amountPaid: 100_000, payments: [{ id: "later", method: "CASH", amount: 100_000, createdAt: new Date("2026-11-12T03:00:00Z") }] };
    mocks.transactions.mockImplementation(async query => query.select?.payments || query.select?.invoiceDate ? [futureInvoice, futurePayment] : []);
    mocks.manual.mockResolvedValue([]);
    const body = await (await GET()).json();
    expect(body.todayRevenue).toBe(100_000);
    expect(body.monthlyRevenue).toBe(100_000);
  });
  it("menjumlahkan penerimaan bulanan dalam sen tanpa selisih pecahan", async () => {
    mocks.transactions.mockResolvedValue([]);
    mocks.manual.mockResolvedValue([
      { id: "a", occurredAt: new Date("2026-11-10T03:00:00Z"), category: "ATK", amount: 0.1 },
      { id: "b", occurredAt: new Date("2026-11-11T03:00:00Z"), category: "ATK", amount: 0.2 },
    ]);
    const body = await (await GET()).json();
    expect(body.monthlyRevenue).toBe(0.3);
  });

});
