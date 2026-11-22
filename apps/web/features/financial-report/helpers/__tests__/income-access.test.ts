import { describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions, type Role, type RolePermissions } from "@/features/rbac/helpers/rbac-core";

type Access = { dailyTotal: boolean; dailyMethods: boolean; periodTotals: boolean; outstandingDp: boolean; manualDetails: boolean };
type ReceiptAccess = { total: boolean; category: boolean; subcategory: boolean; method: boolean; outstandingDp: boolean; manualDetails: boolean };
type Helpers = { resolveIncomeAccess: (role: Role, permissions: RolePermissions) => Access; resolveReceiptHistoryAccess: (role: Role, permissions: RolePermissions) => ReceiptAccess };
const loadHelpers = () => vi.importActual<Helpers>("../income-access").catch(() => null);
const dailyTargets = ["financial-report.daily-income", "financial-report.daily-category", "financial-report.daily-subcategory", "financial-report.daily-payment-method", "financial-report.daily-outstanding-dp"];

function salesWithOnly(target: string) {
  const permissions = buildDefaultRolePermissions();
  permissions.SALES.pages["/financial-report"] = true;
  permissions.SALES.pages["/history"] = true;
  permissions.SALES.resources.transaction.read = true;
  permissions.SALES.resources.income.read = false;
  permissions.SALES.resources["financial-report"].read = false;
  for (const key of dailyTargets) permissions.SALES.resources[key].read = key === target;
  return permissions;
}

describe("izin agregat dan riwayat penerimaan", () => {
  it("mengizinkan total harian tanpa membuka total bulanan atau detail manual", async () => {
    const helpers = await loadHelpers();
    expect(helpers).not.toBeNull();
    if (!helpers) return;
    const access = helpers.resolveIncomeAccess("SALES", salesWithOnly("financial-report.daily-income"));
    expect(access).toMatchObject({ dailyTotal: true, dailyMethods: false, periodTotals: false, manualDetails: false });
  });

  it("memerlukan akses halaman laporan untuk izin harian", async () => {
    const helpers = await loadHelpers();
    expect(helpers).not.toBeNull();
    if (!helpers) return;
    const permissions = salesWithOnly("financial-report.daily-income");
    permissions.SALES.pages["/financial-report"] = false;
    expect(helpers.resolveIncomeAccess("SALES", permissions).dailyTotal).toBe(false);
  });

  it("memisahkan izin rincian metode dari total dan kategori pada Riwayat", async () => {
    const helpers = await loadHelpers();
    expect(helpers).not.toBeNull();
    if (!helpers) return;
    const permissions = salesWithOnly("financial-report.daily-payment-method");
    expect(helpers.resolveReceiptHistoryAccess("SALES", permissions)).toMatchObject({ total: false, category: false, subcategory: false, method: true, outstandingDp: false, manualDetails: false });
  });

  it("menolak semua rincian Riwayat ketika akses halaman atau transaksi dicabut", async () => {
    const helpers = await loadHelpers();
    expect(helpers).not.toBeNull();
    if (!helpers) return;
    const permissions = salesWithOnly("financial-report.daily-income");
    permissions.SALES.pages["/history"] = false;
    expect(helpers.resolveReceiptHistoryAccess("SALES", permissions).total).toBe(false);
    permissions.SALES.pages["/history"] = true;
    permissions.SALES.resources.transaction.read = false;
    expect(helpers.resolveReceiptHistoryAccess("SALES", permissions).total).toBe(false);
  });

  it("mengizinkan agregat periode dan detail manual sesuai izin pemasukan", async () => {
    const helpers = await loadHelpers();
    expect(helpers).not.toBeNull();
    if (!helpers) return;
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.pages["/financial-report"] = false;
    permissions.ADMIN.resources.income.read = true;
    expect(helpers.resolveIncomeAccess("ADMIN", permissions)).toMatchObject({ dailyTotal: true, dailyMethods: true, periodTotals: true, manualDetails: true });
    expect(helpers.resolveReceiptHistoryAccess("ADMIN", permissions).total).toBe(false);
  });
});
