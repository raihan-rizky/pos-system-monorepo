import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), manual: vi.fn(), customerReceivables: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async importOriginal => ({
  ...await importOriginal(),
  getCurrentUser: mocks.user,
}));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manual }, customerReceivable: { findMany: mocks.customerReceivables } } }));
import { GET } from "../route";

const targets = ["financial-report.daily-income", "financial-report.daily-category", "financial-report.daily-subcategory", "financial-report.daily-payment-method", "financial-report.daily-outstanding-dp"];
const sections = ["total", "categories", "subcategories", "paymentMethods", "outstandingDp"];
const request = (query = "date=2026-11-05") => new Request(`http://localhost/api/finance/report/daily?${query}`);
const permissionsWithoutReceivableRead = () => {
  const permissions = buildDefaultRolePermissions();
  permissions.SALES.resources.transaction.read = false;
  permissions.SALES.resources.customer.read = false;
  permissions.SALES.resources["customer.receivable"].read = false;
  return permissions;
};

describe("daily finance API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "sales-1", role: "SALES", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(permissionsWithoutReceivableRead());
    mocks.transactions.mockResolvedValue([{ id: "t1", createdAt: new Date("2026-10-01T03:00:00Z"), status: "DP", total: 100, amountPaid: 40, change: 0, paymentMethod: "TRANSFER", transactionCategory: "PERCETAKAN", printingSubcategory: "PLAT", items: [], payments: [{ id: "p1", method: "TRANSFER", amount: 40, createdAt: new Date() }], debtPaymentLogs: [] }]);
    mocks.manual.mockResolvedValue([]);
    mocks.customerReceivables.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("returns temporary unavailability when the current session cannot be verified", async () => {
    const { AuthError } = await import("@/lib/rbac/guard");
    mocks.user.mockRejectedValueOnce(new AuthError(503, "Sesi belum dapat diverifikasi"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it("scopes database queries to authenticated store and payment dates, never selects cost or customer data", async () => {
    const response = await GET(request("date=2026-11-05&storeId=other"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ date: "2026-11-05", total: 40, outstandingDp: 60, categories: [{ category: "Percetakan", amount: 40 }], paymentMethods: [{ method: "TRANSFER", amount: 40 }] });
    const query = mocks.transactions.mock.calls[0][0];
    expect(query.where.storeId).toBe("store-1");
    expect(JSON.stringify(query.where)).toContain("2026-11-04T17:00:00.000Z");
    expect(query.where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ status: "DP", createdAt: { lt: new Date("2026-11-05T17:00:00.000Z") } })]));
    expect(query.where).not.toHaveProperty("invoiceDate");
    for (const field of ["unitCost", "grossProfit", "customer", "cashier", "salesperson", "expense"]) {
      expect(JSON.stringify(query.select)).not.toContain(field);
      expect(JSON.stringify(body)).not.toContain(field);
    }
    expect(mocks.manual.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", deletedAt: null });
  });

  it("keeps the initial payment and settlement on their actual receipt date when the invoice date differs", async () => {
    const now = new Date();
    mocks.transactions.mockResolvedValueOnce([{
      id: "moved-invoice", createdAt: now, invoiceDate: new Date("2026-11-04T03:00:00Z"),
      status: "COMPLETED", total: 50_000, amountPaid: 50_000, change: 0,
      paymentMethod: "CASH", transactionCategory: "ATK", items: [],
      payments: [{ id: "dp", method: "CASH", amount: 25_000, createdAt: now }],
      debtPaymentLogs: [{ id: "settlement", paymentMethod: "TRANSFER", amount: 25_000, createdAt: now }],
    }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      total: 50_000, outstandingDp: 0,
      categories: [{ category: "ATK", amount: 50_000 }],
      paymentMethods: [{ method: "CASH", amount: 25_000 }, { method: "TRANSFER", amount: 25_000 }],
    });
  });

  it("returns the selected-date receivable balance as the only granted daily metric", async () => {
    const permissions = permissionsWithoutReceivableRead();
    for (const target of targets) permissions.SALES.resources[target].read = false;
    permissions.SALES.resources.transaction.read = true;
    permissions.SALES.resources.customer.read = false;
    permissions.SALES.resources["customer.receivable"].read = true;
    mocks.permissions.mockResolvedValue(permissions);
    mocks.transactions.mockResolvedValue([{ status: "COMPLETED", paymentMethod: "TEMPO", total: 1_000, amountPaid: 400 }]);
    mocks.customerReceivables.mockResolvedValueOnce([{ amount: 500, amountPaid: 200 }]);

    const response = await GET(request("date=2026-11-05"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ date: "2026-11-05", receivableBalance: 900 });
    expect(mocks.transactions).toHaveBeenCalledOnce();
    expect(mocks.transactions.mock.calls[0][0].where).toMatchObject({
      storeId: "store-1", status: "COMPLETED", paymentMethod: "TEMPO",
      invoiceDate: { lt: new Date("2026-11-05T17:00:00.000Z") },
    });
    expect(mocks.customerReceivables).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", debtDate: { lte: new Date("2026-11-05T00:00:00.000Z") } },
    }));
    expect(mocks.manual).not.toHaveBeenCalled();
  });

  it.each(["transaction", "customer.receivable"] as const)("omits the receivable balance when %s read is denied", async deniedTarget => {
    const permissions = permissionsWithoutReceivableRead();
    permissions.SALES.resources.transaction.read = true;
    permissions.SALES.resources.customer.read = true;
    permissions.SALES.resources["customer.receivable"].read = true;
    permissions.SALES.resources[deniedTarget].read = false;
    permissions.SALES.resources["financial-report.daily-outstanding-dp"].read = true;
    mocks.permissions.mockResolvedValue(permissions);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("outstandingDp", 60);
    expect(body).not.toHaveProperty("receivableBalance");
    expect(mocks.customerReceivables).not.toHaveBeenCalled();
  });

  it.each(targets.map((target, index) => [target, sections[index]]))("returns only the independently granted section %s", async (target, section) => {
    const permissions = permissionsWithoutReceivableRead();
    for (const key of targets) permissions.SALES.resources[key].read = key === target;
    mocks.permissions.mockResolvedValue(permissions);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(Object.keys(await response.json()).sort()).toEqual(["date", section].sort());
  });

  it("denies access when all sections are revoked before querying financial rows", async () => {
    const permissions = permissionsWithoutReceivableRead();
    for (const target of targets) permissions.SALES.resources[target].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.manual).not.toHaveBeenCalled();
  });
  it("requires page access in addition to section permissions", async () => {
    const permissions = permissionsWithoutReceivableRead(); permissions.SALES.pages["/financial-report"] = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await GET(request())).status).toBe(403);
  });
  it("requires authentication and an assigned store", async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    mocks.user.mockResolvedValueOnce({ role: "SALES", storeId: null });
    expect((await GET(request())).status).toBe(403);
  });
  it("fails closed when the permission snapshot cannot be verified", async () => {
    mocks.permissions.mockRejectedValueOnce(new Error("unavailable"));
    expect((await GET(request())).status).toBe(503);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  it.each(["date=2026-11-06", "date=2026-02-30", "date=2026-11-04&dateTo=2026-11-05", "date=2026-11-04&date=2026-11-05"])("rejects invalid dates and date ranges %s", async query => {
    expect((await GET(request(query))).status).toBe(422);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  it("lets the OWNER use daily aggregates with no granular grants", async () => {
    mocks.user.mockResolvedValueOnce({ id: "owner", role: "OWNER", storeId: "store-1" });
    expect((await GET(request())).status).toBe(200);
  });
  it("uses saved SALES section grants in the OWNER preview, not OWNER grants", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const permissions = permissionsWithoutReceivableRead();
    for (const key of targets) permissions.SALES.resources[key] = { create: false, read: key === "financial-report.daily-outstanding-dp", update: false, delete: false };
    mocks.permissions.mockResolvedValue(permissions);
    const response = await GET(request("date=2026-11-05&view=sales"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ date: "2026-11-05", outstandingDp: 60 });
    expect(body).not.toHaveProperty("receivableBalance");
  });
  it("reports saved Sales access to receipt history for Owner preview", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const permissions = permissionsWithoutReceivableRead();
    permissions.SALES.pages["/history"] = false;
    mocks.permissions.mockResolvedValue(permissions);
    const body = await (await GET(request("date=2026-11-05&view=sales"))).json();
    expect(body.receiptHistoryAccess).toMatchObject({ total: false, category: false, subcategory: false, method: false, outstandingDp: false });
  });
  it("reports the full SALES view when full access is granted without querying daily data", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const permissions = permissionsWithoutReceivableRead();
    permissions.SALES.resources["financial-report"].read = true;
    for (const key of targets) permissions.SALES.resources[key].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    const response = await GET(request("date=2026-11-05&view=sales"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ date: "2026-11-05", viewMode: "full" });
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.manual).not.toHaveBeenCalled();
  });
  it("does not let the OWNER preview bypass the SALES page grant", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const permissions = permissionsWithoutReceivableRead();
    permissions.SALES.pages["/financial-report"] = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await GET(request("date=2026-11-05&view=sales"))).status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  it.each(["SALES", "ADMIN", "CASHIER", "INVENTORY"])("denies the OWNER preview parameter to %s", async role => {
    mocks.user.mockResolvedValue({ id: "other", role, storeId: "store-1" });
    expect((await GET(request("date=2026-11-05&view=sales"))).status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  it("rejects duplicate preview values", async () => {
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    expect((await GET(request("date=2026-11-05&view=sales&view=sales"))).status).toBe(422);
  });
});
