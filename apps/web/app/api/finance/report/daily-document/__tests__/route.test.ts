import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions, normalizeRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { buildReportFooter, type ReportRow } from "@/features/financial-report/helpers/journal-core";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), permissions: vi.fn(), income: vi.fn(), financial: vi.fn(), journal: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadDailyIncome: mocks.income }));
vi.mock("@/features/financial-report/services/financial-report", () => ({ loadFinancialReport: mocks.financial }));
vi.mock("@/features/financial-report/services/financial-journal", () => ({ loadFinancialJournal: mocks.journal }));

const date = "2026-11-24";
const reportTarget = "financial-report.daily-report";
const rows: ReportRow[] = [
  { tanggal: date, invoice: "INV-CONTOH", person: "Kasir", products: "Buku", categories: "ATK / Buku", status: "Pemasukan", amount: 25000, method: "CASH" },
  { tanggal: date, invoice: "BIAYA-CONTOH", person: "Pemohon", products: "Biaya", categories: "Umum", status: "Pengeluaran", amount: -10000, method: "" },
];

function reportRequest(query = "date=" + date) {
  return new Request("http://localhost/api/finance/report/daily-document?" + query);
}

describe("GET /api/finance/report/daily-document", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.income.mockResolvedValue({ date, total: 25000, paymentMethods: [{ method: "CASH", amount: 25000 }] });
    mocks.financial.mockResolvedValue({
      dateFrom: date, dateTo: date, summary: { expenseTotal: 10000, grossProfit: 15000, revenue: 25000 },
      categories: [{ categoryName: "ATK", revenue: 25000 }],
      subcategories: [{ categoryName: "ATK", subcategoryName: "Buku", revenue: 25000 }],
      summaryCatalog: { categories: ["ATK", "Percetakan"], subcategories: [{ categoryName: "ATK", subcategoryName: "Buku" }, { categoryName: "ATK", subcategoryName: "Amplop" }] },
    });
    mocks.journal.mockResolvedValue({ rows, footer: buildReportFooter(rows) });
  });

  it.each(["OWNER", "ADMIN", "CASHIER"])("allows the daily document for %s by default", async (role) => {
    mocks.user.mockResolvedValue({ role, storeId: "store-example" });
    const response = await GET(reportRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const { journal } = await response.json();
    expect(journal).toMatchObject({ period: "daily", from: date, to: date, rows, footer: { totalPemasukan: 25000, totalPengeluaran: -10000 } });
    expect(JSON.stringify(journal.details).includes("Laba Kotor")).toBe(role !== "CASHIER");
    expect(mocks.income).toHaveBeenCalledOnce();
    expect(mocks.income).toHaveBeenCalledWith("store-example", date);
  });

  it.each(["SALES", "INVENTORY"])("rejects %s by default before loading report data", async (role) => {
    mocks.user.mockResolvedValue({ role, storeId: "store-example" });
    expect((await GET(reportRequest())).status).toBe(403);
    expect(mocks.income).not.toHaveBeenCalled();
    expect(mocks.financial).not.toHaveBeenCalled();
    expect(mocks.journal).not.toHaveBeenCalled();
  });

  it("honors revocation even when the role can export the full report", async () => {
    mocks.user.mockResolvedValue({ role: "ADMIN", storeId: "store-example" });
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([
      { role: "ADMIN", scope: "resource", target: reportTarget, action: "read", allowed: false },
    ]));
    expect((await GET(reportRequest())).status).toBe(403);
    expect(mocks.income).not.toHaveBeenCalled();
  });

  it("allows a Sales grant without exposing expenses or gross profit", async () => {
    mocks.user.mockResolvedValue({ role: "SALES", storeId: "store-example" });
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([
      { role: "SALES", scope: "resource", target: reportTarget, action: "read", allowed: true },
    ]));
    const response = await GET(reportRequest());
    expect(response.status).toBe(200);
    const { journal } = await response.json();
    expect(journal.rows).toHaveLength(1);
    expect(journal.details.showExpenseTotals).toBe(false);
    expect(journal.footer).toMatchObject({ totalPengeluaran: 0, grandTotal: 25000 });
    expect(JSON.stringify(journal)).not.toMatch(/BIAYA-CONTOH|Laba Kotor/);
  });

  it("includes the full zero-valued catalog in the single-page document without loading invoice rows", async () => {
    mocks.user.mockResolvedValue({ role: "CASHIER", storeId: "store-example" });
    const response = await GET(reportRequest("date=" + date + "&layout=single"));
    expect(response.status).toBe(200);
    const { journal } = await response.json();
    expect(journal.rows).toEqual([]);
    expect(JSON.stringify(journal.details.tables)).toMatch(/ATK \/ Amplop.*,.*Rp\s*0/);
    expect(mocks.journal).not.toHaveBeenCalled();
  });

  it.each(["date=not-a-date", "date=2999-12-31", "date=2026-11-24&date=2026-11-25", "date=2026-11-24&view=sales", "date=2026-11-24&storeId=other", "date=2026-11-24&layout=other"])("rejects an invalid document request %s", async (query) => {
    mocks.user.mockResolvedValue({ role: "OWNER", storeId: "store-example" });
    expect((await GET(reportRequest(query))).status).toBe(422);
    expect(mocks.income).not.toHaveBeenCalled();
  });

  it("requires an authenticated user with a store and Laporan Keuangan page access", async () => {
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: "OWNER", storeId: null }).mockResolvedValueOnce({ role: "CASHIER", storeId: "store-example" });
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([
      { role: "CASHIER", scope: "page", target: "/financial-report", action: "access", allowed: false },
    ]));
    expect((await GET(reportRequest())).status).toBe(401);
    expect((await GET(reportRequest())).status).toBe(403);
    expect((await GET(reportRequest())).status).toBe(403);
    expect(mocks.income).not.toHaveBeenCalled();
  });
});
