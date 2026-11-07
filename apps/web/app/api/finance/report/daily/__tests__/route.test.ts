import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), manual: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manual } } }));
import { GET } from "../route";

const targets = ["financial-report.daily-income", "financial-report.daily-category", "financial-report.daily-subcategory", "financial-report.daily-payment-method"];
const sections = ["total", "categories", "subcategories", "paymentMethods"];
const request = (query = "date=2026-11-05") => new Request(`http://localhost/api/finance/report/daily?${query}`);

describe("daily finance API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "sales-1", role: "SALES", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transactions.mockResolvedValue([{ id: "t1", createdAt: new Date("2026-10-01T03:00:00Z"), status: "DP", total: 100, amountPaid: 40, change: 0, paymentMethod: "TRANSFER", transactionCategory: "PERCETAKAN", printingSubcategory: "PLAT", items: [], payments: [{ id: "p1", method: "TRANSFER", amount: 40, createdAt: new Date() }], debtPaymentLogs: [] }]);
    mocks.manual.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("scopes database queries to authenticated store and payment dates, never selects cost or customer data", async () => {
    const response = await GET(request("date=2026-11-05&storeId=other"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ date: "2026-11-05", total: 40, categories: [{ category: "Percetakan", amount: 40 }], paymentMethods: [{ method: "TRANSFER", amount: 40 }] });
    const query = mocks.transactions.mock.calls[0][0];
    expect(query.where.storeId).toBe("store-1");
    expect(JSON.stringify(query.where)).toContain("2026-11-04T17:00:00.000Z");
    expect(query.where).not.toHaveProperty("invoiceDate");
    for (const field of ["unitCost", "grossProfit", "customer", "cashier", "salesperson", "expense"]) {
      expect(JSON.stringify(query.select)).not.toContain(field);
      expect(JSON.stringify(body)).not.toContain(field);
    }
    expect(mocks.manual.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", deletedAt: null });
  });

  it.each(targets.map((target, index) => [target, sections[index]]))("returns only the independently granted section %s", async (target, section) => {
    const permissions = buildDefaultRolePermissions();
    for (const key of targets) permissions.SALES.resources[key].read = key === target;
    mocks.permissions.mockResolvedValue(permissions);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(Object.keys(await response.json()).sort()).toEqual(["date", section].sort());
  });

  it("denies access when all sections are revoked before querying financial rows", async () => {
    const permissions = buildDefaultRolePermissions();
    for (const target of targets) permissions.SALES.resources[target].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.manual).not.toHaveBeenCalled();
  });
  it("requires page access in addition to section permissions", async () => {
    const permissions = buildDefaultRolePermissions(); permissions.SALES.pages["/financial-report"] = false;
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
  it("includes all sections for a non-owner with full report read permission", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources["financial-report"].read = true;
    for (const target of targets) permissions.SALES.resources[target].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(Object.keys(await response.json()).sort()).toEqual(["date", ...sections].sort());
  });
  it("lets the OWNER use daily aggregates with no granular grants", async () => {
    mocks.user.mockResolvedValueOnce({ id: "owner", role: "OWNER", storeId: "store-1" });
    expect((await GET(request())).status).toBe(200);
  });
});
