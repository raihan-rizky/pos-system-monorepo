import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), manual: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.user, requirePermission: mocks.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => ({ db: {
  transaction: { findMany: mocks.transactions, groupBy: async () => [], aggregate: async () => ({ _sum: { total: 0, amountPaid: 0 } }) },
  manualIncome: { findMany: mocks.manual }, transactionItem: { groupBy: async () => [] },
  product: { count: async () => 0, findMany: async () => [] }, $queryRaw: async () => [],
} }));
import { GET as sales } from "@/app/api/finance/report/daily/route";
import { GET as finance } from "@/app/api/finance/income/summary/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as receipts } from "@/app/api/history/receipts/route";

const oldInvoice = {
  id: "old-invoice", invoiceNumber: "INV-OLD", createdAt: new Date("2026-11-09T03:00:00Z"), invoiceDate: new Date("2026-11-09T03:00:00Z"),
  status: "COMPLETED", total: 100_000, amountPaid: 100_000, change: 0, paymentMethod: "CASH", transactionCategory: "ATK", printingSubcategory: null,
  items: [{ subtotal: 100_000, quantity: 1, unitCost: 30_000, product: { category: { name: "Kertas" } } }],
  payments: [{ id: "p", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
  debtPaymentLogs: [{ id: "d", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
};
const dp = { ...oldInvoice, id: "dp", invoiceNumber: "INV-DP", status: "DP", amountPaid: 25_000, payments: [{ id: "dp-payment", method: "CASH", amount: 25_000, createdAt: new Date("2026-11-09T03:00:00Z") }], debtPaymentLogs: [] };
const manual = { id: "manual", description: "Pemasukan contoh", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000 };
const request = (path: string) => new Request(`http://localhost${path}`);

describe("Rekonsiliasi pemasukan lintas halaman", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transactions.mockImplementation(async query => query.select?.invoiceNumber ? [oldInvoice, dp] : query.select?.payments || query.select?.invoiceDate ? [oldInvoice, dp] : [oldInvoice]);
    mocks.manual.mockImplementation(async () => [manual]);
  });
  afterEach(() => vi.useRealTimers());

  it("menyamakan Sales, Keuangan, Dashboard dan rincian penerimaan termasuk pelunasan nota lama", async () => {
    const [daily, monthly, overview, history] = await Promise.all([
      sales(request("/api/finance/report/daily?date=2026-11-11")).then(r => r.json()),
      finance(request("/api/finance/income/summary?month=2026-11&metricsOnly=1")).then(r => r.json()),
      dashboard().then(r => r.json()),
      receipts(request("/api/history/receipts?mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11")).then(r => r.json()),
    ]);
    const detailTotal = [...history.items, ...history.manualEntries].reduce((sum, row) => sum + row.amount, 0);
    expect(daily.total).toBe(80_000);
    expect(monthly.daily.find((row: { date: string }) => row.date === "2026-11-11").total).toBe(daily.total);
    expect(overview.todayRevenue).toBe(daily.total);
    expect(detailTotal).toBe(daily.total);
    expect(history.items).toEqual(expect.arrayContaining([expect.objectContaining({ invoiceNumber: "INV-OLD", amount: 60_000 })]));
    expect(monthly.monthlyTotal).toBe(monthly.daily.reduce((sum: number, row: { total: number }) => sum + row.total, 0));
    expect(monthly.monthlyTotal).toBe(overview.monthlyRevenue);
  });

  it("tidak membuka rincian pemasukan manual kepada Sales tanpa income.read", async () => {
    mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    const history = await (await receipts(request("/api/history/receipts?mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11"))).json();
    expect(history.manualDetailsAvailable).toBe(false);
    expect(history.manualEntries).toBeUndefined();
    expect(JSON.stringify(history)).not.toContain("Pemasukan contoh");
    expect(history.items[0].amount).toBe(60_000);
  });
  it("menyamakan transaksi offline yang tersinkron pada hari berikutnya", async () => {
    const offline = { ...oldInvoice, createdAt: new Date("2026-11-10T03:00:00Z"), offlineSyncMetadata: { reason: "REPLAYED" }, total: 40_000, amountPaid: 40_000,
      payments: [{ id: "offline-payment", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-11T03:00:00Z") }], debtPaymentLogs: [] };
    mocks.transactions.mockResolvedValue([offline]);
    mocks.manual.mockResolvedValue([]);
    const [daily, monthly, overview, history] = await Promise.all([
      sales(request("/api/finance/report/daily?date=2026-11-10")).then(r => r.json()),
      finance(request("/api/finance/income/summary?month=2026-11&metricsOnly=1")).then(r => r.json()),
      dashboard().then(r => r.json()),
      receipts(request("/api/history/receipts?mode=receipt&dateFrom=2026-11-10&dateTo=2026-11-10")).then(r => r.json()),
    ]);
    expect(daily.total).toBe(40_000);
    expect(monthly.daily.find((row: { date: string }) => row.date === "2026-11-10").total).toBe(daily.total);
    expect(history.items[0].amount).toBe(daily.total);
    expect(overview.todayRevenue).toBe(0);
    expect(overview.monthlyRevenue).toBe(daily.total);
  });
});
