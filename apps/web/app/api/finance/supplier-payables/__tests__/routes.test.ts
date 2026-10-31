import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@pos/db", () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET, POST } from "../route";
import { POST as pay } from "../[id]/payments/route";

const request = (body: unknown) => new Request("http://localhost/api/finance/supplier-payables", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const context = { params: Promise.resolve({ id: "debt-1" }) };
const debt = { supplierName: "Pemasok", amount: "1000", debtDate: "2026-10-01", dueDate: "", note: "" };

describe("supplier payable endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T03:00:00Z"));
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  it("lists store debt and returns numeric totals", async () => {
    mocks.query.mockResolvedValue([{ id: "d", supplierName: "Pemasok", amount: "1000.00", paid: "200.50", debtDate: "2026-10-01", dueDate: null, note: null, total: 1n }]);
    const response = await GET(new Request("http://localhost/api/finance/supplier-payables?page=1&storeId=other"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ total: 1, items: [{ amount: 1000, paid: 200.5 }] });
    expect(mocks.query.mock.calls[0]).toContain("store-1");
    expect(mocks.query.mock.calls[0]).not.toContain("other");
  });

  it("saves a debt and its optional initial payment together", async () => {
    const response = await POST(request({ ...debt, initialPayment: "250", initialPaidAt: "2026-10-02" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: expect.any(String) });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.permission).toHaveBeenCalledWith("expense", "create");
  });

  it("rejects invalid or missing-store debts before writing", async () => {
    expect((await POST(request({ ...debt, initialPayment: "1001", initialPaidAt: "2026-10-02" }))).status).toBe(422);
    mocks.permission.mockResolvedValueOnce({ id: "user-1", storeId: null });
    expect((await POST(request(debt))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records a partial payment against the outstanding balance", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01" }]).mockResolvedValueOnce([{ paid: "200.00" }]);
    const response = await pay(request({ amount: "300", paidAt: "2026-10-10" }), context);
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]).toContain("store-1");
    expect(mocks.permission).toHaveBeenCalledWith("expense", "update");
  });

  it("rejects overpayment, payments before the debt date, and unknown debts", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01" }]).mockResolvedValueOnce([{ paid: "200.00" }]);
    expect((await pay(request({ amount: "800.01", paidAt: "2026-10-10" }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01" }]);
    expect((await pay(request({ amount: "1", paidAt: "2026-09-30" }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([]);
    expect((await pay(request({ amount: "1", paidAt: "2026-10-10" }), context)).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an authorization failure without querying data", async () => {
    mocks.permission.mockRejectedValueOnce(new Error("unauthorized"));
    mocks.authError.mockReturnValueOnce(new Response("", { status: 401 }));
    expect((await GET(new Request("http://localhost/api/finance/supplier-payables"))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
