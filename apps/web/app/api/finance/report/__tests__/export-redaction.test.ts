import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import * as XLSX from "xlsx-js-style";
import { buildMonthlyWorkbook, serializeMonthlyWorkbook } from "@/features/financial-report/helpers/monthly-workbook";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), sales: vi.fn(), expenses: vi.fn(), manual: vi.fn(), receivables: vi.fn(), report: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async original => ({ ...await original(), getCurrentUser: mocks.user }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.sales }, expense: { findMany: mocks.expenses }, manualIncome: { findMany: mocks.manual } } }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock("@/features/financial-report/services/manual-payable-period", () => ({ withManualPayableSnapshot: async (_db: unknown, _store: string, _from: string, _to: string,
  read: (tx: unknown) => Promise<unknown>) => ({ data: await read({ expense: { findMany: mocks.expenses } }), payables: { payments: [], transfers: [], balances: [] } }) }));
vi.mock("@/features/financial-report/services/manual-receivable-period", () => ({ loadManualReceivablePeriod: mocks.receivables }));
import { GET as journal } from "../journal/route";
import { GET as monthly } from "../monthly/route";

const journalUrl = "http://localhost/api/finance/report/journal?period=custom&from=2026-09-01&to=2026-09-30";
const monthlyUrl = "http://localhost/api/finance/report/monthly?year=2026&month=9";
const privateStrings = ["private-sale", "INV-SECRET", "Sales Rahasia", "Produk Rahasia", "private-expense", "Pemohon Rahasia", "Catatan Rahasia", "PB-SECRET", "private-customer", "Pelanggan Rahasia", "private-debt", "Pemasok Rahasia", "GIRO-SECRET"];
const amounts = { CETAK: 0, PLAT: 0, STEMPEL: 0, SPANDUK: 0, ATK: 100, PRINT: 0, UNMAPPED: 0 };
const report = {
  year: 2026, month: 9, from: "2026-09-01", to: "2026-09-30",
  income: [{ id: "private-sale:payment", date: "2026-09-04", reference: "INV-SECRET", description: "Produk Rahasia", amounts, breakdown: [{ category: "ATK", subcategory: "Umum", amount: 100 }] },
    { id: "manual:private-customer:payment", date: "2026-09-04", reference: "private-customer", description: "Pelanggan Rahasia", amounts: { ...amounts, ATK: 0, UNMAPPED: 25 }, breakdown: [{ category: "Belum ditentukan", subcategory: "Belum ditentukan", amount: 25 }] }],
  expenses: [{ id: "private-expense", date: "2026-09-04", description: "Catatan Rahasia", categoryName: "Rahasia", amount: 30, group: "OTHER" }],
  purchaseExpenses: [{ id: "private-purchase", date: "2026-09-04", description: "Catatan Rahasia", amount: 20, group: "OTHER", purchase: { reference: "PB-SECRET", method: "GIRO", dueDate: "2026-09-20", supplier: "Pemasok Rahasia" } }],
  purchasePayments: [{ id: "private-payment", date: "2026-09-04", amount: 20, reference: "GIRO-SECRET", supplier: "Pemasok Rahasia", group: "OTHER", method: "GIRO" }],
  giroPayments: [{ id: "private-giro", date: "2026-09-04", amount: 20, reference: "GIRO-SECRET", supplier: "Pemasok Rahasia", group: "OTHER" }],
  receivables: [{ id: "private-customer", date: "2026-09-03", dueDate: "2026-09-20", reference: "INV-SECRET", description: "Catatan Rahasia", customer: "Pelanggan Rahasia", amount: 45 }],
  supplierDebts: [{ id: "private-debt", date: "2026-09-03", dueDate: "2026-09-20", supplier: "Pemasok Rahasia", note: "Catatan Rahasia", amount: 70 }],
  inventoryBalance: 200, supplierDebtBalance: 70, warnings: ["Jatuh tempo giro GIRO-SECRET belum tersedia."],
};

function permissionsFor(role: "ADMIN" | "SALES", allowed: boolean) {
  const permissions = buildDefaultRolePermissions();
  permissions[role].pages["/financial-report"] = true;
  permissions[role].pages["/history"] = allowed;
  permissions[role].pages["/keuangan"] = allowed;
  permissions[role].pages["/products"] = allowed;
  for (const resource of ["financial-report", "financial-report.export"] as const) permissions[role].resources[resource].read = true;
  for (const resource of ["transaction", "expense", "customer", "customer.receivable", "supplier", "expense.payable", "expense.giro", "product"] as const) permissions[role].resources[resource].read = allowed;
  permissions[role].pages["/customers"] = allowed;
  permissions[role].resources.income.read = allowed;
  return permissions;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN", storeId: "store-1" });
  mocks.sales.mockResolvedValue([{ id: "private-sale", invoiceNumber: "INV-SECRET", transactionCategory: "ATK", printingSubcategory: null, printingReceipt: null, invoiceDate: new Date("2026-09-04T03:00:00Z"), salesName: "Sales Rahasia", salesperson: null, customerName: "Pelanggan Rahasia", paymentMethod: "CASH", status: "COMPLETED", amountPaid: 100, total: 100, items: [{ productName: "Produk Rahasia", subtotal: 100, product: { catalogSubcategory: { group: "ATK", name: "Umum" } } }] }]);
  mocks.expenses.mockResolvedValue([{ id: "private-expense", occurredAt: new Date("2026-09-04T04:00:00Z"), applicantName: "Pemohon Rahasia", category: "SUPPLIES", customCategory: null, description: "Catatan Rahasia", amount: 30, changeAmount: 0, hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: { number: "PB-SECRET" } }]);
  mocks.manual.mockResolvedValue([]);
  mocks.receivables.mockResolvedValue([]);
  mocks.report.mockResolvedValue(report);
});

it("menyembunyikan rincian piutang di jurnal dan menolak ekspor bulanan saat izin piutang dicabut", async () => {
  const permissions = permissionsFor("ADMIN", true);
  permissions.ADMIN.resources["customer.receivable"].read = false;
  mocks.permissions.mockResolvedValue(permissions);
  mocks.receivables.mockResolvedValue([{ id: "receivable-secret", amount: 25, reportCategory: "ATK", note: "Piutang Rahasia", customer: { name: "Pelanggan Rahasia" },
    payments: [{ id: "payment-secret", amount: 25, method: "CASH", paidAt: new Date("2026-09-04T00:00:00Z"), createdAt: new Date("2026-09-04T03:00:00Z") }] }]);
  const journalBody = await (await journal(new Request(journalUrl))).json();
  expect(JSON.stringify(journalBody)).not.toContain("Piutang Rahasia");
  expect(JSON.stringify(journalBody)).not.toContain("receivable-secret");
  expect(journalBody.footer.totalPemasukan).toBe(125);
  expect((await monthly(new Request(monthlyUrl))).status).toBe(403);
});

describe.each(["admin", "sales", "preview"] as const)("rincian ekspor untuk %s", actor => {
  function setup(allowed: boolean) {
    const role = actor === "admin" ? "ADMIN" : "SALES";
    mocks.permissions.mockResolvedValue(permissionsFor(role, allowed));
    if (actor === "preview") mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    if (actor === "sales") mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
  }
  const suffix = actor === "preview" ? "&view=sales" : "";
  it("mempertahankan rincian saat seluruh sumber diizinkan", async () => {
    setup(true);
    const journalBody = await (await journal(new Request(journalUrl + suffix))).json();
    expect(JSON.stringify(journalBody)).toContain("INV-SECRET");
    expect(JSON.stringify(journalBody)).toContain("Catatan Rahasia");
    const monthlyBody = await (await monthly(new Request(monthlyUrl + suffix))).json();
    expect(monthlyBody).toEqual(report);
    expect(JSON.stringify(buildMonthlyWorkbook(monthlyBody))).toContain("INV-SECRET");
    const savedWorkbook = XLSX.read(serializeMonthlyWorkbook(monthlyBody), { type: "array", cellStyles: true });
    expect(JSON.stringify(savedWorkbook)).toContain("INV-SECRET");
  });
  it("meringkas jurnal dan menolak workbook jika izin sumber belum lengkap", async () => {
    setup(false);
    const journalResponse = await journal(new Request(journalUrl + suffix));
    expect(journalResponse.status).toBe(200);
    expect(journalResponse.headers.get("cache-control")).toContain("no-store");
    const journalBody = await journalResponse.json();
    for (const secret of privateStrings) expect(JSON.stringify(journalBody)).not.toContain(secret);
    expect(journalBody.footer).toMatchObject({ totalPemasukan: 100, totalPengeluaran: -30, grandTotal: 70, byMethod: { CASH: 100 } });
    const monthlyResponse = await monthly(new Request(monthlyUrl + suffix));
    expect(monthlyResponse.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});

it.each(["transaction", "history", "expense", "customer", "supplier", "payable", "giro"])("menyamarkan jurnal dan menolak workbook saat izin sumber dicabut: %s", async missing => {
  const permissions = permissionsFor("ADMIN", true);
  if (missing === "history") permissions.ADMIN.pages["/history"] = false;
  else {
    const resource = missing === "payable" ? "expense.payable" : missing === "giro" ? "expense.giro" : missing as "transaction" | "expense" | "customer" | "supplier";
    permissions.ADMIN.resources[resource].read = false;
  }
  mocks.permissions.mockResolvedValue(permissions);
  const journalBody = await (await journal(new Request(journalUrl))).json();
  const monthlyResponse = await monthly(new Request(monthlyUrl));
  expect(monthlyResponse.status).toBe(403);
  expect(mocks.report).not.toHaveBeenCalled();
  if (missing === "transaction" || missing === "history") expect(JSON.stringify(journalBody)).not.toContain("INV-SECRET");
  if (missing === "customer") expect(JSON.stringify(journalBody)).not.toContain("Pelanggan Rahasia");
  if (["expense", "supplier", "payable", "giro"].includes(missing)) {
    expect(JSON.stringify(journalBody)).not.toContain("PB-SECRET");
    expect(JSON.stringify(journalBody)).not.toContain("Catatan Rahasia");
  }
});

it("menjaga rincian pengeluaran dan piutang yang diizinkan ketika akses sumber lain dicabut", async () => {
  const permissions = permissionsFor("ADMIN", true);
  permissions.ADMIN.resources.supplier.read = false;
  permissions.ADMIN.resources.transaction.read = false;
  mocks.permissions.mockResolvedValue(permissions);
  mocks.expenses.mockResolvedValue([
    { id: "ordinary", occurredAt: new Date("2026-09-04T04:00:00Z"), applicantName: "Pemohon Diizinkan", category: "SUPPLIES", customCategory: null, description: "Biaya Diizinkan", amount: 12, changeAmount: 0, hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: null },
    { id: "purchase", occurredAt: new Date("2026-09-04T04:30:00Z"), applicantName: "Pemasok Rahasia", category: "SUPPLIES", customCategory: null, description: "Catatan Rahasia", amount: 18, changeAmount: 0, hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: { number: "PB-SECRET" } },
    { id: "manual-purchase", occurredAt: new Date("2026-09-04T04:30:00Z"), applicantName: "Pemasok Rahasia", category: "SUPPLIES", customCategory: null, description: "Catatan Rahasia", amount: 5, changeAmount: 0, hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: null, manualPurchasePaymentMethod: "TRANSFER" },
  ]);
  mocks.report.mockResolvedValue({ ...report, receivables: [...report.receivables,
    { id: "manual:allowed", date: "2026-09-04", dueDate: null, reference: "Piutang Diizinkan", description: "Catatan Diizinkan", customer: "Pelanggan Diizinkan", amount: 15 }],
    expenses: [...report.expenses, { ...report.purchaseExpenses[0], id: "legacy-purchase" }] });
  const journalBody = await (await journal(new Request(journalUrl))).json();
  expect(JSON.stringify(journalBody)).toContain("Biaya Diizinkan");
  expect(JSON.stringify(journalBody)).not.toContain("PB-SECRET");
  expect(JSON.stringify(journalBody)).not.toContain("Pemasok Rahasia");
  expect(journalBody.footer.totalPengeluaran).toBe(-35);
  const monthlyResponse = await monthly(new Request(monthlyUrl));
  expect(monthlyResponse.status).toBe(403);
  expect(mocks.report).not.toHaveBeenCalled();
});

it("menjaga total belanja format lama dengan izin lengkap", async () => {
  mocks.permissions.mockResolvedValue(permissionsFor("ADMIN", true));
  mocks.report.mockResolvedValue({ ...report, purchaseExpenses: undefined, purchasePayments: undefined, giroPayments: undefined,
    expenses: [{ ...report.purchaseExpenses[0], purchase: { ...report.purchaseExpenses[0].purchase, method: "TRANSFER" } }] });
  const monthlyBody = await (await monthly(new Request(monthlyUrl))).json();
  const workbook = buildMonthlyWorkbook(monthlyBody);
  expect(JSON.stringify(monthlyBody)).toContain("PB-SECRET");
  expect(monthlyBody.expenses[0].purchase).toMatchObject({ method: "TRANSFER", reference: "PB-SECRET" });
  expect(workbook.Sheets.BERSIH.F25.v).toBe(20);
});

it.each(["admin", "sales", "preview"] as const)("menyembunyikan fallback nama pelanggan tanpa customer.read untuk %s", async actor => {
  const role = actor === "admin" ? "ADMIN" : "SALES";
  const permissions = permissionsFor(role, true);
  permissions[role].resources.customer.read = false;
  mocks.permissions.mockResolvedValue(permissions);
  if (actor === "sales") mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
  if (actor === "preview") mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
  mocks.sales.mockResolvedValue([
    { id: "sale-customer", invoiceNumber: "INV-1", transactionCategory: "ATK", printingReceipt: null, invoiceDate: new Date("2026-09-04T03:00:00Z"), salesName: null, salesperson: null, customerName: "Pelanggan Rahasia", paymentMethod: "CASH", status: "COMPLETED", total: 40, amountPaid: 40, items: [] },
    { id: "sale-sales", invoiceNumber: "INV-2", transactionCategory: "ATK", printingReceipt: null, invoiceDate: new Date("2026-09-04T04:00:00Z"), salesName: "Sales Diizinkan", salesperson: null, customerName: "Pelanggan Rahasia", paymentMethod: "CASH", status: "COMPLETED", total: 60, amountPaid: 60, items: [] },
  ]);
  const suffix = actor === "preview" ? "&view=sales" : "";
  const body = await (await journal(new Request(journalUrl + suffix))).json();
  expect(JSON.stringify(body)).not.toContain("Pelanggan Rahasia");
  expect(body.rows.find((row: { invoice: string }) => row.invoice === "INV-1").person).toBe("");
  expect(body.rows.find((row: { invoice: string }) => row.invoice === "INV-2").person).toBe("Sales Diizinkan");
  expect(body.footer.totalPemasukan).toBe(100);
});

it.each(["backdatedPurchaseDueId", "backdatedPurchasePaymentId"] as const)("menggabungkan pengeluaran belanja terdahulu tanpa izin sumber: %s", async source => {
  const permissions = permissionsFor("ADMIN", true);
  permissions.ADMIN.resources.supplier.read = false;
  mocks.permissions.mockResolvedValue(permissions);
  mocks.expenses.mockResolvedValue([{ id: "private-backdated", occurredAt: new Date("2026-09-04T04:00:00Z"), applicantName: "Pemasok Rahasia", category: "SUPPLIES", customCategory: null, description: "Catatan Rahasia", amount: 30, changeAmount: 0, hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: null, [source]: "private-purchase" }]);
  const body = await (await journal(new Request(journalUrl))).json();
  expect(JSON.stringify(body)).not.toContain("private-backdated");
  expect(JSON.stringify(body)).not.toContain("Pemasok Rahasia");
  expect(JSON.stringify(body)).not.toContain("Catatan Rahasia");
  expect(body.footer.totalPengeluaran).toBe(-30);
  expect(mocks.expenses.mock.calls[0][0].select[source]).toBe(true);
});

it.each(["transaction", "history", "expense", "customer", "supplier", "payable", "giro", "product", "products"] as const)(
  "menolak ekspor bulanan sebelum memuat data jika izin %s tidak tersedia",
  async missing => {
    const permissions = permissionsFor("ADMIN", true);
    if (missing === "history") permissions.ADMIN.pages["/history"] = false;
    else if (missing === "products") permissions.ADMIN.pages["/products"] = false;
    else {
      const resource = missing === "payable" ? "expense.payable" : missing === "giro" ? "expense.giro" : missing;
      permissions.ADMIN.resources[resource].read = false;
    }
    mocks.permissions.mockResolvedValue(permissions);
    const response = await monthly(new Request(monthlyUrl));
    expect(response.status).toBe(403);
    expect((await response.json()).message).toContain("hak akses");
    expect(mocks.report).not.toHaveBeenCalled();
  },
);

it.each(["admin", "sales", "preview"] as const)(
  "menggunakan izin efektif untuk menolak ekspor bulanan %s sebelum membaca data",
  async actor => {
    const role = actor === "admin" ? "ADMIN" : "SALES";
    const permissions = permissionsFor(role, true);
    permissions[role].resources["expense.payable"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    if (actor === "sales") mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    if (actor === "preview") mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const response = await monthly(new Request(monthlyUrl + (actor === "preview" ? "&view=sales" : "")));
    expect(response.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  },
);
