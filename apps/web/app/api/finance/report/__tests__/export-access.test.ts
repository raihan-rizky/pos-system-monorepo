import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), sales: vi.fn(), expenses: vi.fn(), manual: vi.fn(), report: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async original => ({ ...await original(), getCurrentUser: mocks.user, requirePermission: mocks.user }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.sales }, expense: { findMany: mocks.expenses }, manualIncome: { findMany: mocks.manual },
  customerReceivable: { findMany: async () => [] }, $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({ expense: { findMany: mocks.expenses }, supplierPayable: { findMany: async () => [] } }) } }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
import { GET as journal } from "../journal/route";
import { GET as monthly } from "../monthly/route";
import { getFinancialExportAccess } from "@/features/financial-report/services/export-access";

const endpoints = [
  { name: "jurnal", get: journal, url: "http://localhost/api/finance/report/journal?period=monthly" },
  { name: "bulanan", get: monthly, url: "http://localhost/api/finance/report/monthly?year=2026&month=9" },
];

it("tidak membuka rincian hutang jika akses halaman Keuangan dicabut", async () => {
  const permissions = buildDefaultRolePermissions();
  grantMonthlySources(permissions, "ADMIN");
  permissions.ADMIN.pages["/keuangan"] = false;
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN", storeId: "store-1" });
  mocks.permissions.mockResolvedValue(permissions);
  const access = await getFinancialExportAccess(new Request("http://localhost/api/finance/report/journal"));
  expect(access).toMatchObject({ canReadPurchases: false });
});

function grantMonthlySources(permissions: ReturnType<typeof buildDefaultRolePermissions>, role: "ADMIN" | "SALES") {
  permissions[role].pages["/history"] = true;
  permissions[role].pages["/products"] = true;
  permissions[role].pages["/customers"] = true;
  permissions[role].pages["/keuangan"] = true;
  for (const resource of ["transaction", "product", "customer", "customer.receivable", "expense", "supplier", "expense.payable", "expense.giro"] as const) {
    permissions[role].resources[resource].read = true;
  }
}

describe.each(endpoints)("izin ekspor $name", ({ get, url }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.sales.mockResolvedValue([]); mocks.expenses.mockResolvedValue([]); mocks.manual.mockResolvedValue([]); mocks.report.mockResolvedValue({ income: [], expenses: [], receivables: [], warnings: [] });
  });
  it("mengizinkan pengguna dengan izin halaman, laporan dan ekspor", async () => {
    expect((await get(new Request(url))).status).toBe(200);
  });
  it.each(["page", "report", "export"])("menolak tanpa izin %s sebelum membaca data", async missing => {
    const permissions = buildDefaultRolePermissions();
    if (missing === "page") permissions.ADMIN.pages["/financial-report"] = false;
    if (missing === "report") permissions.ADMIN.resources["financial-report"].read = false;
    if (missing === "export") permissions.ADMIN.resources["financial-report.export"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await get(new Request(url))).status).toBe(403);
    expect(mocks.sales).not.toHaveBeenCalled(); expect(mocks.expenses).not.toHaveBeenCalled(); expect(mocks.report).not.toHaveBeenCalled();
  });
  it("memakai izin Sales yang tersimpan dalam pratinjau Owner", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const permissions = buildDefaultRolePermissions();
    grantMonthlySources(permissions, "SALES");
    permissions.SALES.pages["/financial-report"] = true;
    permissions.SALES.resources["financial-report"].read = true;
    permissions.SALES.resources["financial-report.export"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await get(new Request(`${url}&view=sales`))).status).toBe(403);
    permissions.SALES.resources["financial-report.export"].read = true;
    expect((await get(new Request(`${url}&view=sales`))).status).toBe(200);
  });
  it("menolak pratinjau bukan Owner dan gagal tertutup jika izin tidak tersedia", async () => {
    expect((await get(new Request(`${url}&view=sales`))).status).toBe(403);
    mocks.permissions.mockRejectedValueOnce(new Error("unavailable"));
    expect((await get(new Request(url))).status).toBe(503);
  });
  it("menolak parameter pratinjau yang tidak valid atau duplikat", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    expect((await get(new Request(`${url}&view=other`))).status).toBe(422);
    expect((await get(new Request(`${url}&view=sales&view=sales`))).status).toBe(422);
  });
  it("menolak sesi tanpa pengguna sebelum membaca data", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await get(new Request(url))).status).toBe(401);
    expect(mocks.sales).not.toHaveBeenCalled(); expect(mocks.report).not.toHaveBeenCalled();
  });
});

it("menyamarkan rincian pemasukan manual tanpa izin income.read", async () => {
  vi.clearAllMocks();
  const permissions = buildDefaultRolePermissions();
  permissions.ADMIN.resources.income.read = false;
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN", storeId: "store-1" });
  mocks.permissions.mockResolvedValue(permissions);
  mocks.sales.mockResolvedValue([]); mocks.expenses.mockResolvedValue([]);
  mocks.manual.mockResolvedValue([
    { id: "private-1", occurredAt: new Date("2026-05-04T03:00:00Z"), description: "Deskripsi rahasia", category: "ATK", amount: 40, payments: [{ method: "CASH", amount: 40 }] },
    { id: "private-2", occurredAt: new Date("2026-05-04T04:00:00Z"), description: "Deskripsi lainnya", category: "ATK", amount: 60, payments: [{ method: "CASH", amount: 60 }] },
  ]);
  const response = await journal(new Request("http://localhost/api/finance/report/journal?period=custom&from=2026-05-03&to=2026-05-05"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain("private-");
  expect(JSON.stringify(body)).not.toContain("Deskripsi");
  expect(body.rows).toHaveLength(1);
  expect(body.rows[0]).toMatchObject({ categories: "ATK / Pemasukan manual", amount: 100, method: "CASH" });
  expect(body.footer.totalPemasukan).toBe(100);
  expect(body.categories).toContainEqual({ categoryName: "ATK / Pemasukan manual", transactionCount: 2, revenue: 100 });
});

describe("rincian pemasukan manual pada ekspor bulanan", () => {
  const rows = [
    { id: "manual-income:private-1", date: "2026-09-04", reference: "Pemasukan manual private-1", description: "Deskripsi rahasia", amounts: { ATK: 40, PRINT: 0 }, breakdown: [{ category: "ATK", subcategory: "Pemasukan manual", amount: 40 }] },
    { id: "manual-income:private-2", date: "2026-09-04", reference: "Pemasukan manual private-2", description: "Deskripsi kedua", amounts: { ATK: 60, PRINT: 0 }, breakdown: [{ category: "ATK", subcategory: "Pemasukan manual", amount: 60 }] },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN", storeId: "store-1" });
    mocks.report.mockResolvedValue({ year: 2026, month: 9, income: rows, expenses: [], receivables: [], warnings: [] });
  });
  it("mempertahankan rincian jika income.read diizinkan", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.resources.income.read = true;
    mocks.permissions.mockResolvedValue(permissions);
    const response = await monthly(new Request("http://localhost/api/finance/report/monthly?year=2026&month=9"));
    expect((await response.json()).income).toEqual(rows);
  });
  it.each([false, true])("menyamarkan dan menggabungkan rincian yang ditolak (preview=%s)", async preview => {
    const permissions = buildDefaultRolePermissions();
    const role = preview ? "SALES" : "ADMIN";
    grantMonthlySources(permissions, role);
    permissions[role].pages["/financial-report"] = true;
    permissions[role].resources["financial-report"].read = true;
    permissions[role].resources["financial-report.export"].read = true;
    permissions[role].resources.income.read = false;
    mocks.permissions.mockResolvedValue(permissions);
    if (preview) mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const response = await monthly(new Request(`http://localhost/api/finance/report/monthly?year=2026&month=9${preview ? "&view=sales" : ""}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("private-");
    expect(JSON.stringify(body)).not.toContain("Deskripsi");
    expect(body.income).toHaveLength(1);
    expect(body.income[0]).toMatchObject({ date: "2026-09-04", amounts: { ATK: 100 }, breakdown: [{ category: "ATK", subcategory: "Pemasukan manual", amount: 100 }] });
  });
});
